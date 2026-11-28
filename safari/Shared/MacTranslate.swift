// 맥 번역 (Apple Translation, 기기 안). 크롬판의 크롬 내장 번역 자리.
// 확장은 init(installedSource:target:) 로 화면 없이 번역한다 — 언어가 설치돼 있어야 해서, 받기는 앱 화면(translationTask)에서만.
import Foundation
import Translation

enum MacTranslate {
    static let target = Locale.Language(identifier: "ko")
    static func source(_ s: String) -> Locale.Language { Locale.Language(identifier: s == "ja" ? "ja" : "en") }

    /// 화면 없이 번역(init(installedSource:target:))은 macOS 26 이상 — 그 전 macOS 에서는 맥 번역을 쓸 수 없음으로 (Claude · Gemini 는 됨)
    static var headless: Bool { if #available(macOS 26.0, *) { return true } else { return false } }

    /// installed · supported(받을 수 있음) · unsupported · old-macos
    static func state(_ src: String) async -> String {
        guard headless else { return "old-macos" }
        switch await LanguageAvailability().status(from: source(src), to: target) {
        case .installed: return "installed"
        case .supported: return "supported"
        default: return "unsupported"
        }
    }
}

/// 확장 프로세스 안에서 원문 언어별 세션을 다시 쓴다 (첫 번역만 느림)
actor TranslatorPool {
    static let shared = TranslatorPool()
    private var sessions: [String: TranslationSession] = [:]

    func translate(_ text: String, src: String) async throws -> String {
        guard #available(macOS 26.0, *) else { throw CocoaError(.featureUnsupported) }
        let s: TranslationSession
        if let cur = sessions[src] { s = cur } else {
            s = TranslationSession(installedSource: MacTranslate.source(src), target: MacTranslate.target)
            sessions[src] = s
        }
        do { return try await s.translate(text).targetText } catch { sessions[src] = nil; throw error }
    }
}
