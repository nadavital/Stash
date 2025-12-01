import SwiftUI

/// A beautiful section for asking questions about an item with pre-generated prompts
struct AskAboutSection: View {
    let item: ItemSummary
    @Environment(\.dismiss) private var dismiss
    @State private var isExpanded = true
    
    // Get prompts from metadata or use defaults based on type
    private var prompts: [String] {
        if let suggestedPrompts = item.metadata.suggestedPrompts, !suggestedPrompts.isEmpty {
            return suggestedPrompts
        }
        return defaultPrompts(for: item.type)
    }
    
    private func defaultPrompts(for type: EntityType) -> [String] {
        switch type {
        case .song:
            return ["Similar artists?", "What genre?", "More like this?"]
        case .recipe:
            return ["Substitutions?", "How long?", "Wine pairing?"]
        case .article:
            return ["Key points?", "Related reads?", "Summarize"]
        case .event:
            return ["Event details?", "Who's going?", "What to wear?"]
        case .generic:
            return ["Tell me more", "Why save this?", "Similar items?"]
        default:
            return ["Tell me more", "Why save this?", "Similar items?"]
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 10) {
                // AI Icon with glow
                ZStack {
                    Circle()
                        .fill(StashTheme.Color.aiSoft)
                        .frame(width: 36, height: 36)
                    
                    Image(systemName: "brain.head.profile")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(StashTheme.Color.ai)
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ask Stash")
                        .font(StashTypography.caption.bold())
                        .foregroundColor(StashTheme.Color.textPrimary)
                    
                    Text("Chat about this item")
                        .font(StashTypography.caption)
                        .foregroundColor(StashTheme.Color.textMuted)
                }
                
                Spacer()
                
                // Custom prompt button
                Button {
                    askCustomQuestion()
                } label: {
                    Image(systemName: "text.cursor")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(StashTheme.Color.textSecondary)
                        .padding(8)
                        .background(StashTheme.Color.surfaceSoft)
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            
            Divider()
                .background(StashTheme.Color.borderSubtle)
            
            // Suggested prompts
            VStack(alignment: .leading, spacing: 10) {
                ForEach(prompts, id: \.self) { prompt in
                    PromptButton(prompt: prompt) {
                        askPrompt(prompt)
                    }
                }
            }
            .padding(16)
        }
        .background(StashTheme.Color.surface)
        .cornerRadius(StashTheme.Radius.card)
        .overlay(
            RoundedRectangle(cornerRadius: StashTheme.Radius.card)
                .stroke(
                    LinearGradient(
                        colors: [StashTheme.Color.aiSoft, StashTheme.Color.borderSubtle],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
    }
    
    private func askPrompt(_ prompt: String) {
        // Combine the prompt with item context
        let fullPrompt = "\(prompt) — \"\(item.title.htmlDecoded)\""
        
        dismiss()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            NotificationCenter.default.post(
                name: .askAboutItem,
                object: nil,
                userInfo: [
                    "prompt": fullPrompt,
                    "itemId": item.itemId
                ]
            )
        }
    }
    
    private func askCustomQuestion() {
        // Navigate to brain with item context but no preset prompt
        let prompt = "Tell me about \"\(item.title.htmlDecoded)\""
        
        dismiss()
        
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

/// Individual prompt button with nice styling
private struct PromptButton: View {
    let prompt: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(prompt)
                    .font(StashTypography.body)
                    .foregroundColor(StashTheme.Color.textPrimary)
                
                Spacer()
                
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(StashTheme.Color.ai)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(StashTheme.Color.surfaceSoft)
            .cornerRadius(StashTheme.Radius.pill)
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

#Preview {
    VStack {
        AskAboutSection(item: .mockArticle)
            .padding()
        
        AskAboutSection(item: .mockSong)
            .padding()
    }
    .background(StashTheme.Color.bg)
}
