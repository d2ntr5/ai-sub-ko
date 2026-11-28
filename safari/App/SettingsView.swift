// 설정 (시안 4 · 5장): 엔진 · 사이트 · 용어집 · 정보. 키 · 동의는 키체인 공유 그룹(SharedStore)에.
import SwiftUI
import Translation

struct SettingsView: View {
    var body: some View {
        TabView {
            EngineTab().tabItem { Label("엔진", systemImage: "gearshape") }
            SitesTab().tabItem { Label("사이트", systemImage: "globe") }
            GlossaryTab().tabItem { Label("용어집", systemImage: "list.bullet") }
            AboutTab().tabItem { Label("정보", systemImage: "info.circle") }
        }
        .frame(width: 560)
    }
}

// MARK: 엔진

@MainActor
final class EngineModel: ObservableObject {
    @Published var keys: [Engine: String] = [:]
    @Published var saved: [Engine: Bool] = [:]
    @Published var note: [Engine: String] = [:]
    @Published var macState = "확인 중"
    @Published var consentFor: Engine? = nil

    init() {
        for e in Engine.allCases {
            let k = SharedStore.key(e)
            keys[e] = k
            saved[e] = !k.isEmpty && SharedStore.consented(e)
        }
    }

    func refreshMac() async { macState = await MacTranslate.state("en") }

    /// 저장: 처음이면 동의를 먼저 (동의 전에는 저장하지 않음)
    func save(_ e: Engine) {
        let v = (keys[e] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { _ = SharedStore.setKey(e, ""); saved[e] = false; note[e] = "지웠어요 · 맥 번역으로 번역해요"; return }
        if e == .claude && !v.hasPrefix("sk-ant-") { note[e] = "키 모양이 이상해요. sk-ant- 로 시작하는지 확인해 주세요."; return }
        if !SharedStore.consented(e) { consentFor = e; return }
        store(e, v)
    }

    func consent(_ e: Engine, _ yes: Bool) {
        consentFor = nil
        guard yes else { note[e] = "보내지 않아요 · 맥 번역만 써요 (키는 저장하지 않았어요)"; return }
        let s = SharedStore.setConsent(e, true)
        guard s == errSecSuccess else { note[e] = "동의를 저장하지 못했어요 (키체인 \(s))"; return }
        store(e, (keys[e] ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func store(_ e: Engine, _ v: String) {
        let s = SharedStore.setKey(e, v)
        saved[e] = s == errSecSuccess
        note[e] = s == errSecSuccess ? "✓ 저장됨 · 열려 있는 Safari 탭에도 15초 안에 적용돼요" : "저장하지 못했어요 (키체인 \(s))"
    }

    /// 연결 테스트: 모델 목록을 받아 본다 (키는 그 회사로만 감)
    func test(_ e: Engine) async {
        let v = (keys[e] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { note[e] = "키를 먼저 넣어 주세요"; return }
        note[e] = "확인 중…"
        var req: URLRequest
        if e == .claude {
            req = URLRequest(url: URL(string: "https://api.anthropic.com/v1/models?limit=20")!)
            req.setValue(v, forHTTPHeaderField: "x-api-key")
            req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        } else {
            req = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=50")!)
            req.setValue(v, forHTTPHeaderField: "x-goog-api-key")
        }
        req.timeoutInterval = 15
        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            let code = (res as? HTTPURLResponse)?.statusCode ?? 0
            note[e] = code == 200 ? "✓ 연결됨 · 이 키로 쓸 수 있어요" : code == 401 || code == 400 || code == 403 ? "✗ 키가 맞지 않아요 (HTTP \(code))" : "✗ 연결 실패 (HTTP \(code))"
        } catch { note[e] = "✗ 연결 실패 · 인터넷 연결을 확인해 주세요" }
    }
}

struct EngineTab: View {
    @StateObject private var m = EngineModel()
    @State private var macConfig: TranslationSession.Configuration? = nil
    @State private var macBusy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                EngineCard(title: "맥 번역", sub: "키 없이 · 이 맥 안에서", on: true,
                           pill: m.macState == "installed" ? ("영어 → 한국어 받음", .ok) : m.macState == "supported" ? ("언어 받기 필요", .wait) : (m.macState == "확인 중" ? "확인 중" : m.macState == "old-macos" ? "macOS 26 이상" : "쓸 수 없음", .no), color: .accentColor)
                EngineCard(title: "Claude", sub: "라이브 · 문맥 · 용어집", on: m.saved[.claude] == true,
                           pill: m.saved[.claude] == true ? ("키 있음", .ok) : ("키 없음", .no), color: Color(red: 0.76, green: 0.37, blue: 0.24))
                EngineCard(title: "Gemini Flash Lite", sub: "자막 전체 미리 번역", on: m.saved[.gemini] == true,
                           pill: m.saved[.gemini] == true ? ("키 있음", .ok) : ("키 없음", .no), color: .blue)
            }
            Text("Claude · Gemini 를 쓰면 영상 자막 글이 그 회사(Anthropic · Google)로 가요. 소리 · 화면은 보내지 않아요. 처음 저장할 때 한 번 물어봐요.")
                .font(.system(size: 11.5)).foregroundStyle(.secondary)
                .padding(.horizontal, 9).padding(.vertical, 7).frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 7).fill(Color.secondary.opacity(0.08)))
            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 10) {
                keyRow(.claude, placeholder: "sk-ant-…")
                keyRow(.gemini, placeholder: "AI Studio 에서 만든 키")
                GridRow {
                    Text("맥 번역 언어").font(.system(size: 12.5)).foregroundStyle(.secondary).gridColumnAlignment(.trailing)
                    HStack {
                        Text("영어 → 한국어")
                        Pill(text: m.macState == "installed" ? "받음" : m.macState == "supported" ? "안 받음" : m.macState == "old-macos" ? "macOS 26 이상에서 돼요" : m.macState == "확인 중" ? "확인 중" : "쓸 수 없음", kind: m.macState == "installed" ? .ok : .wait)
                        Spacer()
                        if m.macState == "supported" {
                            Button(macBusy ? "받는 중…" : "받기") {
                                macBusy = true
                                macConfig = .init(source: MacTranslate.source("en"), target: MacTranslate.target)
                            }.buttonStyle(.borderedProminent).disabled(macBusy)
                        }
                    }
                }
                GridRow {
                    Text("AI 안 될 때").font(.system(size: 12.5)).foregroundStyle(.secondary)
                    Text("맥 번역으로 대신 · 켜고 끄기는 Safari 툴바 KO 팝업에서").font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            Link("키 만들기: Anthropic Console", destination: URL(string: "https://platform.claude.com/settings/keys")!).font(.system(size: 11.5))
            Link("키 만들기: Google AI Studio", destination: URL(string: "https://aistudio.google.com/app/apikey")!).font(.system(size: 11.5))
        }
        .padding(20)
        .task { await m.refreshMac() }
        .translationTask(macConfig) { session in
            try? await session.prepareTranslation()
            await m.refreshMac()
            macBusy = false
        }
        .sheet(item: $m.consentFor) { e in ConsentSheet(engine: e) { yes in m.consent(e, yes) } }
    }

    @ViewBuilder private func keyRow(_ e: Engine, placeholder: String) -> some View {
        GridRow {
            Text("\(e == .claude ? "Claude" : "Gemini") API 키").font(.system(size: 12.5)).foregroundStyle(.secondary).gridColumnAlignment(.trailing)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    SecureField(placeholder, text: Binding(get: { m.keys[e] ?? "" }, set: { m.keys[e] = $0 }))
                        .textFieldStyle(.roundedBorder).font(.system(size: 12, design: .monospaced))
                    Button("저장") { m.save(e) }
                    Button("연결 테스트") { Task { await m.test(e) } }
                }
                if let n = m.note[e] { Text(n).font(.system(size: 11)).foregroundStyle(n.hasPrefix("✗") || n.contains("못") || n.contains("이상") ? .red : .secondary) }
            }
        }
    }
}

struct EngineCard: View {
    let title: String; let sub: String; let on: Bool; let pill: (String, Pill.Kind); let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(color)
            Text(sub).font(.system(size: 11)).foregroundStyle(.secondary)
            Pill(text: pill.0, kind: pill.1)
        }
        .padding(.horizontal, 10).padding(.vertical, 9).frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 9).strokeBorder(on ? Color.accentColor : Color.secondary.opacity(0.25), lineWidth: on ? 1.5 : 1))
    }
}

// MARK: 외부 AI 동의 (시안 5장, 심사 지침 5.1.2(i))

struct ConsentSheet: View {
    let engine: Engine
    let done: (Bool) -> Void
    @State private var read = false
    var policy: URL { URL(string: engine == .claude ? "https://www.anthropic.com/legal/commercial-terms" : "https://ai.google.dev/gemini-api/terms")! }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("자막 글을 \(engine.company) 로 보낼까요?").font(.system(size: 16, weight: .bold))
            Text("\(engine == .claude ? "Claude" : "Gemini") 로 번역하려면 영상의 영어 자막 글을 \(engine.company)(외부 AI)로 보내요.")
            VStack(alignment: .leading, spacing: 5) {
                row("보내는 것", "번역할 자막 줄 · 앞뒤 몇 줄 · 쓰는 용어집")
                row("받는 곳", "\(engine.company) (\(engine == .claude ? "Claude API" : "Gemini API")) · 내 API 키로")
                row("보내지 않는 것", "영상 · 소리 · 화면 · 방문한 주소 목록 · 개인 정보")
                row("비용", engine == .claude ? "내 Anthropic 계정에 바로 청구 (하루 상한 $1, 확장 상세 설정에서 바꿈)" : "무료 등급은 0원 · 무료 등급은 보낸 자막이 Google 제품 개선에 쓰일 수 있어요")
            }
            .font(.system(size: 12.5)).padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.08)))
            HStack(spacing: 6) {
                Toggle("\(engine.company) 의 데이터 처리 방침을 읽었어요", isOn: $read).toggleStyle(.checkbox).font(.system(size: 12.5))
                Link("열기", destination: policy).font(.system(size: 12.5))
            }
            Text("설정 › 정보에서 언제든 동의를 거둘 수 있어요.").font(.system(size: 11.5)).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("안 보내요 · 맥 번역만") { done(false) }.keyboardShortcut(.cancelAction)
                Button("보내도 돼요") { done(true) }.buttonStyle(.borderedProminent).disabled(!read)
            }
        }
        .padding(22).frame(width: 440)
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(k).foregroundStyle(.secondary).frame(width: 92, alignment: .leading)
            Text(v).fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: 사이트 · 용어집 · 정보

struct SitesTab: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("적용 사이트").font(.headline)
            Text("기본: F1 TV · YouTube · AWS Skill Builder · Anthropic Academy. 다른 사이트는 영상 페이지에서 Safari 툴바 **KO › 이 사이트에서 켜기**.")
            Text("사이트별 켜기 · 끄기, 자막 위치, YouTube 설정은 Safari 툴바 **KO › 상세 설정 › 적용 사이트**에 있어요.")
            Text("Safari는 사이트마다 이 확장의 접근을 물어요. 바꾸려면 Safari 설정 › 웹사이트 › AI 자막 번역.").foregroundStyle(.secondary)
            Spacer()
        }.font(.system(size: 12.5)).padding(20).frame(height: 300)
    }
}

struct GlossaryTab: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("용어집").font(.headline)
            Text("F1 · 클라우드 · AI · 개발 · 영화 · 드라마 묶음이 들어 있어요. 고치기 · 더하기는 Safari 툴바 **KO › 상세 설정 › 용어집**.")
            Text("크롬판에서 옮기기").font(.system(size: 12.5, weight: .bold)).padding(.top, 6)
            Text("1. 크롬판 상세 설정 › 용어집 › **내보내기** (JSON)\n2. Safari 툴바 KO › 상세 설정 › 용어집 › **가져오기**\n3. API 키는 옮기지 않아요. 설정 › 엔진에서 다시 넣어 주세요.")
            Spacer()
        }.font(.system(size: 12.5)).padding(20).frame(height: 300)
    }
}

struct AboutTab: View {
    @State private var consent: [Engine: Bool] = [:]
    var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                AppIconView(size: 40)
                VStack(alignment: .leading) {
                    Text("AI 자막 번역").font(.system(size: 14, weight: .bold))
                    Text("버전 \(version) · Safari · macOS 15 이상 · 업데이트는 App Store에서 받아요").font(.system(size: 11.5)).foregroundStyle(.secondary)
                }
            }
            Text("외부 AI로 보내기 동의").font(.system(size: 12.5, weight: .bold)).padding(.top, 4)
            ForEach(Engine.allCases) { e in
                HStack {
                    Text("\(e.name) (\(e.company))")
                    Spacer()
                    if consent[e] == true {
                        Pill(text: "동의함", kind: .ok)
                        Button("동의 거두기") { _ = SharedStore.setConsent(e, false); reload() }.controlSize(.small)
                    } else { Pill(text: "동의 안 함", kind: .wait) }
                }.font(.system(size: 12.5))
            }
            Divider().padding(.vertical, 4)
            Text(Legal.notice).font(.system(size: 11.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Link("개인정보 처리방침", destination: URL(string: "https://github.com/d2ntr5/ai-sub-ko/blob/main/PRIVACY.md")!)
                Link("소스 (MIT)", destination: URL(string: "https://github.com/d2ntr5/ai-sub-ko")!)
            }.font(.system(size: 11.5))
            Text("© 2026 d2ntr5").font(.system(size: 11.5)).foregroundStyle(.secondary)  // app-standards/update-and-about.md 2장 6번
            Spacer()
        }
        .padding(20).frame(height: 360)
        .onAppear(perform: reload)
    }

    private func reload() { for e in Engine.allCases { consent[e] = SharedStore.consented(e) } }
}

enum Legal {
    /// 크롬판 1.0.28 문장 그대로 + 「영상 저장 안 함」 (총괄 확정 2026-11-29)
    static let notice = "번역은 생성형 AI(Anthropic Claude · Google Gemini)나 맥 번역이 만들어요. 영상 위 자막에 「AI 번역」이 표시돼요. 개인 시청용이에요. 번역 자막은 이 맥에서만 보이고 저장 · 배포하지 않아요. 영상을 내려받거나 저장하지 않아요. 각 사이트의 이용약관을 지켜 주세요."
}


