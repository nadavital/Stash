import SwiftUI

extension View {
    /// Apply a card style with shadow and corner radius
    func cardStyle() -> some View {
        self
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.08), radius: 2, x: 0, y: 1)
    }

    /// AI-highlighted card variant
    func aiCardStyle() -> some View {
        self
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(StashTheme.Color.aiSoft, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.08), radius: 2, x: 0, y: 1)
    }

    /// Pressed state animation
    func pressedScale(_ isPressed: Bool) -> some View {
        self.scaleEffect(isPressed ? 0.98 : 1.0)
            .animation(.easeOut(duration: 0.15), value: isPressed)
    }

    /// Apply a subtle animation
    func subtleAnimation() -> some View {
        self.animation(.easeInOut(duration: 0.3), value: UUID())
    }
}
