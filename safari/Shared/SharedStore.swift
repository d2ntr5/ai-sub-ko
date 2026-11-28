// 앱과 Safari 확장(앱 확장)이 같이 보는 저장소: API 키 · 외부 AI 동의.
// 데이터 보호 키체인의 공유 그룹(keychain-access-groups, 그룹 이름은 Info.plist 의 AISubKoKeychainGroup — 빌드가 팀 ID 를 채움).
// 확장 JS 에는 동의한 엔진의 키만 넘긴다 (심사 지침 5.1.2(i)).
import Foundation
import Security

enum Engine: String, CaseIterable, Identifiable {
    case claude, gemini
    var id: String { rawValue }
    var name: String { self == .claude ? "Claude" : "Gemini Flash Lite" }
    var company: String { self == .claude ? "Anthropic" : "Google" }
}

enum SharedStore {
    static var group: String? { Bundle.main.object(forInfoDictionaryKey: "AISubKoKeychainGroup") as? String }

    private static func query(_ account: String) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "io.github.d2ntr5.ai-sub-ko",
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true
        ]
        if let g = group { q[kSecAttrAccessGroup as String] = g }
        return q
    }

    static func read(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    @discardableResult
    static func write(_ account: String, _ value: String?) -> OSStatus {
        let q = query(account)
        guard let value, !value.isEmpty else {
            let s = SecItemDelete(q as CFDictionary)
            return s == errSecItemNotFound ? errSecSuccess : s
        }
        let data = Data(value.utf8)
        let s = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if s != errSecItemNotFound { return s }
        var add = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil)
    }

    static func key(_ e: Engine) -> String { read("key-\(e.rawValue)") ?? "" }
    static func setKey(_ e: Engine, _ v: String) -> OSStatus { write("key-\(e.rawValue)", v.trimmingCharacters(in: .whitespacesAndNewlines)) }
    static func consented(_ e: Engine) -> Bool { read("consent-\(e.rawValue)") != nil }
    static func setConsent(_ e: Engine, _ on: Bool) -> OSStatus {
        write("consent-\(e.rawValue)", on ? ISO8601DateFormatter().string(from: Date()) : nil)
    }
    static func consentDate(_ e: Engine) -> String? { read("consent-\(e.rawValue)") }

    /// 확장에 넘길 키: 동의한 엔진만
    static func keysForExtension() -> [String: String] {
        var out: [String: String] = [:]
        for e in Engine.allCases where consented(e) { out[e.rawValue] = key(e) }
        return out
    }
}
