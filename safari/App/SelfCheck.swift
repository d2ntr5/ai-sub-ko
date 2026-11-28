// 자체 점검 (확인 빌드에서 시험 세션 · 앱 세션이 씀): 샌드박스 안에서 키체인 공유 그룹 쓰기/읽기/지우기와 맥 번역.
//   …/MacOS/AISubKo -AISubKoSelfCheck <컨테이너 안 파일.json>   → 결과 JSON 을 쓰고 끝냄. 사용자 키 · 동의는 건드리지 않음 ("selfcheck" 항목만)
import AppKit

@MainActor
enum SelfCheck {
    static func requestedFile() -> String? { UserDefaults.standard.string(forKey: "AISubKoSelfCheck") }

    static func run(to path: String) async {
        var r: [String: Any] = ["group": SharedStore.group ?? "-", "bundle": Bundle.main.bundleIdentifier ?? "-"]
        let token = UUID().uuidString
        r["keychainWrite"] = Int(SharedStore.write("selfcheck", token))
        r["keychainRead"] = SharedStore.read("selfcheck") == token
        r["keychainDelete"] = Int(SharedStore.write("selfcheck", nil))
        r["keychainGone"] = SharedStore.read("selfcheck") == nil
        r["macState"] = await MacTranslate.state("en")
        let t0 = Date()
        do {
            r["translate"] = try await TranslatorPool.shared.translate("Verstappen is closing the gap, he's within DRS now.", src: "en")
            r["translateSec"] = Date().timeIntervalSince(t0)
        } catch { r["translateError"] = String(describing: error) }
        if let d = try? JSONSerialization.data(withJSONObject: r, options: [.prettyPrinted, .sortedKeys]) {
            try? d.write(to: URL(fileURLWithPath: path))
        }
        NSApp.terminate(nil)
    }
}
