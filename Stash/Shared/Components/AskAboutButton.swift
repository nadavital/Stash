import SwiftUI

/// A button that navigates to the Brain tab with a pre-filled question about an item
struct AskAboutButton: View {
    let item: ItemSummary
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        Button {
            askAboutItem()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(StashTheme.Color.ai)
                
                Text("Ask about this")
                    .font(StashTypography.body.weight(.medium))
                    .foregroundColor(StashTheme.Color.textPrimary)
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(StashTheme.Color.textMuted)
            }
            .padding(16)
            .background(StashTheme.Color.surface)
            .cornerRadius(StashTheme.Radius.card)
            .overlay(
                RoundedRectangle(cornerRadius: StashTheme.Radius.card)
                    .stroke(StashTheme.Color.aiSoft, lineWidth: 1)
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
    
    private func askAboutItem() {
        // Build prompt based on item
        let prompt = "Tell me more about \"\(item.title.htmlDecoded)\""
        
        // Dismiss detail view first
        dismiss()
        
        // Small delay to allow dismissal, then switch to Brain tab
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            NotificationCenter.default.post(
                name: .askAboutItem,
                object: nil,
                userInfo: [
                    "prompt": prompt,
                    "itemId": item.itemId
                ]
            )
        }
    }
}

#Preview {
    AskAboutButton(item: .mockArticle)
        .padding()
        .background(StashTheme.Color.bg)
}
