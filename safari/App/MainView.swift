// 첫 화면: 켜는 순서 셋과 지금 어디까지 됐는지 (시안 2장)
import SwiftUI
import SafariServices

let extensionID = (Bundle.main.bundleIdentifier ?? "io.github.d2ntr5.ai-sub-ko") + ".extension"

@MainActor
final class ExtState: ObservableObject {
    @Published var enabled: Bool? = nil
    @Published var engineLine = "지금: 맥 번역 (키 없이, 이 맥 안에서)"

    func refresh() {
        if Snapshot.active { enabled = Snapshot.extEnabled; engineLine = engineText(); return }
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionID) { st, _ in
            Task { @MainActor in self.enabled = st?.isEnabled ?? false }
        }
        engineLine = engineText()
    }

    private func engineText() -> String {
        let on = Engine.allCases.filter { SharedStore.consented($0) && !SharedStore.key($0).isEmpty }.map(\.name)
        return on.isEmpty ? "지금: 맥 번역 (키 없이, 이 맥 안에서)" : "지금: \(on.joined(separator: " · ")) → 맥 번역"
    }
}

struct MainView: View {
    @StateObject private var st = ExtState()
    @ObservedObject private var router = Router.shared
    @Environment(\.openSettings) private var openSettings
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                AppIconView(size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI 자막 번역").font(.system(size: 17, weight: .bold))
                    Text("영상의 영어 자막을 한국어 자막으로 · Safari 확장").font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
            }
            StepLine(n: 1, state: st.enabled == true ? .done : .now, title: "Safari에서 확장 켜기",
                     detail: st.enabled == true ? "켜짐 ✓ · Safari 설정 › 확장에서 언제든 끌 수 있어요" : "Safari 설정 › 확장에서 「AI 자막 번역」을 체크해 주세요") {
                if st.enabled != true { Button("Safari에서 켜기") { showSafariSettings() }.buttonStyle(.borderedProminent) }
            }
            StepLine(n: 2, state: st.enabled == true ? .now : .wait, title: "영상 사이트 허용",
                     detail: "YouTube · F1 TV 를 처음 열 때 Safari가 물어요 · 「이 웹사이트에서 항상 허용」을 눌러 주세요") {
                if st.enabled == true { Button("도움말") { openWindow(id: "help") } } else { Pill(text: "켠 뒤에", kind: .wait) }
            }
            StepLine(n: 3, state: .wait, title: "번역 엔진", detail: st.engineLine) {
                Button("설정 열기") { openSettings() }
            }
            HStack {
                Text("확장 상태: ").font(.system(size: 11.5)).foregroundStyle(.secondary)
                + Text(st.enabled == nil ? "확인 중" : st.enabled! ? "켜짐" : "꺼짐").font(.system(size: 11.5, weight: .bold))
                    .foregroundColor(st.enabled == true ? .green : .red)
                + Text(" · 앱으로 돌아오면 다시 확인해요").font(.system(size: 11.5)).foregroundStyle(.secondary)
                Spacer()
                Button("도움말") { openWindow(id: "help") }.controlSize(.small)
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 20).padding(.vertical, 18)
        .frame(width: 520)
        .onAppear { st.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in st.refresh() }
        .onChange(of: router.wantSettings) { openSettings() }
    }

    private func showSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionID) { _ in }
    }
}

enum StepState { case done, now, wait }

struct StepLine<Trailing: View>: View {
    let n: Int; let state: StepState; let title: String; let detail: String
    @ViewBuilder var trailing: () -> Trailing
    var body: some View {
        HStack(spacing: 10) {
            Text(state == .done ? "✓" : "\(n)").font(.system(size: 11, weight: .bold)).foregroundStyle(state == .wait ? Color.secondary : .white)
                .frame(width: 20, height: 20)
                .background(Circle().fill(state == .done ? Color.green : state == .now ? Color.accentColor : Color.secondary.opacity(0.18)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .bold))
                Text(detail).font(.system(size: 11.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 9).strokeBorder(state == .now ? Color.accentColor : Color.secondary.opacity(0.25), lineWidth: state == .now ? 1.5 : 1))
    }
}

struct Pill: View {
    enum Kind { case ok, no, wait, info }
    let text: String; let kind: Kind
    var body: some View {
        let c: Color = kind == .ok ? .green : kind == .no ? .red : kind == .wait ? .orange : .accentColor
        Text(text).font(.system(size: 11, weight: .semibold)).foregroundStyle(c)
            .padding(.horizontal, 8).padding(.vertical, 1)
            .background(Capsule().fill(c.opacity(0.14)))
    }
}

/// 앱 아이콘 (확장 아이콘과 같은 파란 자막 얼굴)
struct AppIconView: View {
    var size: CGFloat
    var body: some View {
        Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: size, height: size)
    }
}
