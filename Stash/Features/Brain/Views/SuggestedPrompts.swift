import SwiftUI

/// Suggested prompt chips for the Brain tab
struct SuggestedPrompts: View {
    let prompts = [
        "What did I save this week?",
        "What can I do right now?",
        "What am I into lately?"
    ]

    let onTap: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(prompts, id: \.self) { prompt in
                    Button {
                        onTap(prompt)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 12, weight: .medium))
                            Text(prompt)
                                .font(StashTypography.body)
                        }
                        .foregroundColor(StashTheme.Color.ai)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(StashTheme.Color.aiSoft)
                        .cornerRadius(StashTheme.Radius.pill)
                    }
                    .buttonStyle(ScaleButtonStyle())
                }
            }
            .padding(.horizontal)
        }
    }
}

#Preview {
    SuggestedPrompts { prompt in
        print("Tapped: \(prompt)")
    }
}
