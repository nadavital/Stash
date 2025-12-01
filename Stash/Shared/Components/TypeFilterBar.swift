import SwiftUI

/// Horizontal scrolling filter bar for item types
struct TypeFilterBar: View {
    @Binding var selectedFilter: EntityType?
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // "All" filter
                FilterPill(
                    title: "All",
                    emoji: "✨",
                    isSelected: selectedFilter == nil
                ) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedFilter = nil
                    }
                }
                
                // Type-specific filters
                ForEach(EntityType.filterOptions, id: \.self) { type in
                    FilterPill(
                        title: type.displayName,
                        emoji: type.emoji,
                        isSelected: selectedFilter == type
                    ) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedFilter = (selectedFilter == type) ? nil : type
                        }
                    }
                }
            }
            .padding(.horizontal, StashSpacing.screenHorizontal)
        }
    }
}

/// Individual filter pill button
struct FilterPill: View {
    let title: String
    let emoji: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(emoji)
                    .font(.system(size: 14))
                
                Text(title)
                    .font(StashTypography.caption.weight(.medium))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? StashTheme.Color.accent : StashTheme.Color.surface)
            .foregroundColor(isSelected ? StashTheme.Color.textPrimary : StashTheme.Color.textSecondary)
            .cornerRadius(StashTheme.Radius.pill)
            .overlay(
                RoundedRectangle(cornerRadius: StashTheme.Radius.pill)
                    .stroke(isSelected ? Color.clear : StashTheme.Color.borderSubtle, lineWidth: 1)
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

#Preview {
    VStack {
        TypeFilterBar(selectedFilter: .constant(nil))
        TypeFilterBar(selectedFilter: .constant(.article))
    }
    .padding(.vertical)
    .background(StashTheme.Color.bg)
}
