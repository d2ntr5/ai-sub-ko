// AI 자막 번역 — Safari 확장을 담는 맥 앱 (Mac App Store, 샌드박스).
// 창: 첫 화면(Safari에서 켜기) · 설정(엔진 · 키 · 동의 · 정보) · 도움말(쓰는 법 · 키 없이 해 보기).
import SwiftUI

@main
struct AISubKoApp: App {
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        Window("AI 자막 번역", id: "main") {
            MainView()
                .onOpenURL { url in Router.shared.open(url) }
                .task {
                    if let p = Snapshot.requestedDir() { await Snapshot.run(to: p) }
                    if let p = SelfCheck.requestedFile() { await SelfCheck.run(to: p) }
                }
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .help) {
                Button("AI 자막 번역 도움말") { openWindow(id: "help") }
            }
        }

        Window("도움말", id: "help") { HelpView() }
            .windowResizability(.contentSize)

        Settings { SettingsView() }
    }
}

/// aisubko://settings (확장 팝업 · 상세 설정의 「앱에서 키 넣기」 · 「앱에서 받기」)
@MainActor
final class Router: ObservableObject {
    static let shared = Router()
    @Published var wantSettings = 0
    func open(_ url: URL) {
        if url.host == "settings" { wantSettings += 1 }
    }
}
