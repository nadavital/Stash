import SwiftUI

/// A chat bubble for user or AI messages
struct ChatBubbleView: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isUser {
                Spacer()
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 8) {
                // Message text
                HStack(spacing: 0) {
                    // AI accent bar on left
                    if !message.isUser {
                        Rectangle()
                            .fill(StashTheme.Color.ai)
                            .frame(width: 3)
                            .cornerRadius(1.5)
                    }

                    Text(message.text)
                        .font(StashTypography.body)
                        .foregroundColor(message.isUser ? StashTheme.Color.textPrimary : StashTheme.Color.textPrimary)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(message.isUser ? StashTheme.Color.accentSoft : StashTheme.Color.surfaceSoft)
                .cornerRadius(StashTheme.Radius.card)
                .overlay(
                    RoundedRectangle(cornerRadius: StashTheme.Radius.card)
                        .stroke(message.isUser ? StashTheme.Color.accent.opacity(0.3) : Color.clear, lineWidth: 1)
                )

                // Referenced items (for AI messages only) - now clickable!
                if !message.referencedItems.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(message.referencedItems) { item in
                            NavigationLink(destination: ItemDetailView(item: item)) {
                                ReferencedItemCard(item: item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Timestamp
                Text(message.timestamp.relativeFormatted)
                    .font(StashTypography.caption)
                    .foregroundColor(StashTheme.Color.textMuted)
            }
            .frame(maxWidth: 280, alignment: message.isUser ? .trailing : .leading)

            if !message.isUser {
                Spacer()
            }
        }
        .padding(.horizontal, StashSpacing.screenHorizontal)
    }
}

/// Compact card for referenced items in chat - tappable to view details
struct ReferencedItemCard: View {
    let item: ItemSummary
    
    var body: some View {
        HStack(spacing: 12) {
            // Emoji or type indicator
            Text(item.primaryEmoji)
                .font(.system(size: 24))
                .frame(width: 40, height: 40)
                .background(StashTheme.Color.surfaceSoft)
                .cornerRadius(StashTheme.Radius.tile)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title.htmlDecoded)
                    .font(StashTypography.cardTitle)
                    .foregroundColor(StashTheme.Color.textPrimary)
                    .lineLimit(1)
                
                HStack(spacing: 4) {
                    TypeChip(type: item.type)
                    
                    if let source = item.metadata.sourceName {
                        Text("• \(source)")
                            .font(StashTypography.caption)
                            .foregroundColor(StashTheme.Color.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(StashTheme.Color.textMuted)
        }
        .padding(10)
        .background(StashTheme.Color.surface)
        .cornerRadius(StashTheme.Radius.card)
        .overlay(
            RoundedRectangle(cornerRadius: StashTheme.Radius.card)
                .stroke(StashTheme.Color.aiSoft, lineWidth: 1)
        )
    }
}

/// AI Typing Indicator - pulsing dots
struct AITypingIndicator: View {
    @State private var animationPhase = 0
    
    var body: some View {
        HStack {
            HStack(spacing: 0) {
                // AI accent bar
                Rectangle()
                    .fill(StashTheme.Color.ai)
                    .frame(width: 3)
                    .cornerRadius(1.5)
                
                HStack(spacing: 6) {
                    ForEach(0..<3) { index in
                        Circle()
                            .fill(StashTheme.Color.ai)
                            .frame(width: 8, height: 8)
                            .opacity(animationPhase == index ? 1.0 : 0.3)
                    }
                }
                .padding(12)
            }
            .background(StashTheme.Color.surfaceSoft)
            .cornerRadius(StashTheme.Radius.card)
            .frame(maxWidth: 80)
            
            Spacer()
        }
        .padding(.horizontal, StashSpacing.screenHorizontal)
        .onAppear {
            startAnimation()
        }
    }
    
    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.2)) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

#Preview {
    NavigationStack {
        VStack(spacing: 16) {
            ChatBubbleView(message: .mockUserMessage)
            ChatBubbleView(message: .mockAIMessage)
            AITypingIndicator()
        }
        .padding()
        .background(StashTheme.Color.bg)
    }
}
