// App Store 스크린샷: 화면 밖에서 2배(2880×1800)로 그려 PNG 로 (dev-guides new-mac-app 5a-8, 화면 · 디스플레이 설정 안 씀).
//   AI 자막 번역.app/Contents/MacOS/AISubKo -AISubKoSnapshot <컨테이너 안 폴더> [-AISubKoSnapshotDark 1]
import SwiftUI
import AppKit

@MainActor
enum Snapshot {
    static var active: Bool { requestedDir() != nil }
    static let extEnabled = true

    static func requestedDir() -> String? { UserDefaults.standard.string(forKey: "AISubKoSnapshot") }

    static func run(to dir: String) async {
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let dark = UserDefaults.standard.bool(forKey: "AISubKoSnapshotDark")
        let shots: [(String, String, String, AnyView)] = [
            ("1-start", "Safari에서 켜고 바로 써요", "앱이 켜는 순서와 지금 상태를 보여 줘요.\n영상의 영어 자막이 영상 위 한국어 자막이 돼요.", AnyView(MainView())),
            ("2-engine", "키 없이도 맥 번역으로", "맥 번역은 이 맥 안에서 번역해요.\nClaude · Gemini 키를 넣으면 더 자연스럽게.", AnyView(EngineTab().frame(width: 560))),
            ("3-consent", "외부 AI로 보내기 전에 물어요", "무엇이 어디로 가는지 보여 드리고,\n동의한 엔진만 써요.", AnyView(ConsentSheet(engine: .claude) { _ in })),
            ("4-help", "⌥K 하나로 켜고 끄기", "YouTube · F1 TV · 강의 사이트의 영어 자막을\n한국어 자막으로 영상 위에 보여 줘요.", AnyView(HelpView()))
        ]
        for (name, title, sub, view) in shots {
            let canvas = Canvas(title: title, sub: sub, content: view).environment(\.colorScheme, dark ? .dark : .light)
            let host = NSHostingView(rootView: canvas)
            host.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            host.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
            let win = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            win.contentView = host
            host.layoutSubtreeIfNeeded()
            try? await Task.sleep(nanoseconds: 1_200_000_000) // 맥 번역 상태 · 아이콘 읽기
            host.layoutSubtreeIfNeeded()
            guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 2880, pixelsHigh: 1800, bitsPerSample: 8, samplesPerPixel: 4,
                                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { continue }
            rep.size = host.bounds.size // 포인트 크기 그대로 → 2배로 그림
            host.cacheDisplay(in: host.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name)\(dark ? "-dark" : "").png"))
        }
        NSApp.terminate(nil)
    }
}

private struct Canvas: View {
    let title: String; let sub: String; let content: AnyView
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        HStack(spacing: 64) {
            VStack(alignment: .leading, spacing: 18) {
                Text(title).font(.system(size: 44, weight: .bold)).fixedSize(horizontal: false, vertical: true)
                Text(sub).font(.system(size: 22)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 520, alignment: .leading)
            VStack(spacing: 0) {
                HStack(spacing: 7) {
                    ForEach([Color(red: 1, green: 0.37, blue: 0.34), Color(red: 1, green: 0.74, blue: 0.18), Color(red: 0.16, green: 0.78, blue: 0.25)], id: \.self) { c in
                        Circle().fill(c).frame(width: 12, height: 12)
                    }
                    Spacer()
                }
                .padding(.horizontal, 12).frame(height: 30)
                content
            }
            .fixedSize()
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .windowBackgroundColor)))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.25), radius: 24, y: 10)
        }
        .padding(64)
        .frame(width: 1440, height: 900)
        .background(LinearGradient(colors: scheme == .dark ? [Color(red: 0.08, green: 0.1, blue: 0.14), Color(red: 0.1, green: 0.16, blue: 0.3)]
                                                         : [Color(red: 0.93, green: 0.95, blue: 0.99), Color(red: 0.8, green: 0.87, blue: 0.98)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
    }
}
