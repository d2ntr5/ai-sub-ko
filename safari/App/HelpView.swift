// 도움말 (시안 3장) + 키 없이 해 보기 (시안 9장, 심사자도 같은 순서)
import SwiftUI

/// 영어 자막(사람이 단 자막)이 있는 공개 영상 — 키 없이 맥 번역으로 해 보기
let demoVideo = URL(string: DemoVideo.url)!

struct HelpView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("이렇게 써요").font(.system(size: 15, weight: .bold))
            VStack(alignment: .leading, spacing: 5) {
                row("1. 자막 켜기", "영상 플레이어의 자막(CC)을 **English** 로 (YouTube 자동 생성 영어도 돼요)")
                row("2. 번역 켜기", "**⌥K** 또는 Safari 툴바 **KO** › 켜기 → 영상 위에 한국어 자막")
                row("3. 원문", "**⌥O** 영어 원문 보이기 · 숨기기")
                row("4. 다른 사이트", "툴바 **KO** › **이 사이트에서 켜기**")
            }
            .font(.system(size: 12.5)).padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.08)))
            Text("자막이 없는 영상(소리만 있는 영상)은 지금 번역하지 않아요. 크롬판의 음성 번역은 Safari에서 확장만으로는 할 수 없어요.")
                .font(.system(size: 12.5)).padding(9).frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.orange.opacity(0.14)))
            Text("키 없이 해 보기").font(.system(size: 13, weight: .bold)).padding(.top, 4)
            VStack(alignment: .leading, spacing: 4) {
                Text("1. 첫 화면에서 Safari 확장을 켜요.")
                HStack { Text("2. 영어 자막이 있는 영상을 열어요."); Link("데모 영상 열기", destination: demoVideo) }
                Text("3. youtube.com 접근을 허용하고 ⌥K → 단추가 「AI 번역·맥」, 한국어 자막이 나와요.")
            }.font(.system(size: 12.5))
            Text(Legal.notice).font(.system(size: 11.5)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
        }
        .padding(.horizontal, 20).padding(.vertical, 18).frame(width: 520)
    }

    private func row(_ k: String, _ v: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(k).foregroundStyle(.secondary).frame(width: 92, alignment: .leading)
            Text(v).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// 확인: 영어 자막(사람이 단 것)은 있고 한국어 자막은 없음 (2026-11-29, 한국어 자막이 있으면 확장이 그걸 먼저 보여 줘서 번역이 안 보임)
enum DemoVideo { static let url = "https://www.youtube.com/watch?v=UF8uR6Z6KLc" }
