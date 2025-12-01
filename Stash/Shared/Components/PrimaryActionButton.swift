import SwiftUI

/// Primary Action Button - Contextual primary action with consistent styling
struct PrimaryActionButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                Text(title)
                    .font(StashTypography.body.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundColor(StashTheme.Color.textPrimary)
            .background(StashTheme.Color.accent)
            .cornerRadius(StashTheme.Radius.button)
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

/// Scale button style with press animation
struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: StashTheme.Motion.fast), value: configuration.isPressed)
    }
}

#Preview {
    VStack(spacing: 16) {
        PrimaryActionButton(
            title: "Read Article",
            icon: "book.fill"
        ) {
            print("Read tapped")
        }

        PrimaryActionButton(
            title: "Play on Apple Music",
            icon: "music.note"
        ) {
            print("Play tapped")
        }

        PrimaryActionButton(
            title: "Add to Calendar",
            icon: "calendar.badge.plus"
        ) {
            print("Add tapped")
        }
    }
    .padding()
    .background(StashTheme.Color.bg)
}
