import SwiftUI

/// Floating action button for adding items to Stash
/// - Matches Ask Stash button pattern (56pt diameter)
/// - Uses StashGlyph icon with tinted interactive glass
/// - Appears on Home and You tabs only
struct FloatingAddButton: View {
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.medium()
            action()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
        }
        .glassEffect(.regular.tint(StashTheme.Color.accent).interactive(), in: .circle)
        .shadow(
            color: StashTheme.Shadow.soft.color,
            radius: StashTheme.Shadow.soft.radius,
            x: StashTheme.Shadow.soft.x,
            y: StashTheme.Shadow.soft.y
        )
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        StashTheme.Color.bg
            .ignoresSafeArea()

        FloatingAddButton {
            print("Add tapped")
        }
    }
}
