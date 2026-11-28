// Safari 확장 JS(background) ↔ 담는 맥 앱. browser.runtime.sendNativeMessage 로 온 요청을 받는다.
// 요청 { type: keys | state | translate | open } — 콘텐츠 스크립트는 직접 못 보내고 background 를 거친다 (Apple 문서).
import AppKit
import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let msg = item?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]
        Task {
            let reply = await Self.handle(msg)
            let res = NSExtensionItem()
            res.userInfo = [SFExtensionMessageKey: reply]
            context.completeRequest(returningItems: [res], completionHandler: nil)
        }
    }

    static func handle(_ msg: [String: Any]) async -> [String: Any] {
        let src = (msg["src"] as? String) == "ja" ? "ja" : "en"
        switch msg["type"] as? String {
        case "keys":
            var out: [String: Any] = ["ok": true]
            for (k, v) in SharedStore.keysForExtension() { out[k] = v }
            return out
        case "state":
            return ["ok": true, "state": await MacTranslate.state(src)]
        case "translate":
            let text = String((msg["text"] as? String ?? "").prefix(2000))
            guard !text.isEmpty else { return ["ok": true, "text": ""] }
            do {
                return ["ok": true, "text": try await TranslatorPool.shared.translate(text, src: src)]
            } catch {
                let st = await MacTranslate.state(src)
                return ["ok": false, "state": st == "installed" ? "error" : st, "error": String(describing: error)]
            }
        case "open":
            let page = (msg["page"] as? String) ?? "settings"
            let scheme = Bundle.main.object(forInfoDictionaryKey: "AISubKoURLScheme") as? String ?? "aisubko"
            let ok = await MainActor.run { NSWorkspace.shared.open(URL(string: "\(scheme)://\(page == "engine" ? "settings" : page)")!) }
            return ["ok": ok]
        default:
            return ["ok": false, "error": "unknown"]
        }
    }
}
