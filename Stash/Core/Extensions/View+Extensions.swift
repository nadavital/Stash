import SwiftUI

extension View {
    /// Apply a card style with shadow and corner radius
    func cardStyle() -> some View {
        self
            .background(StashTheme.Color.surface)
            .cornerRadius(StashTheme.Radius.card)
            .shadow(
                color: StashTheme.Shadow.subtle.color,
                radius: StashTheme.Shadow.subtle.radius,
                x: StashTheme.Shadow.subtle.x,
                y: StashTheme.Shadow.subtle.y
            )
    }

    /// AI-highlighted card variant
    func aiCardStyle() -> some View {
        self
            .background(StashTheme.Color.surface)
            .cornerRadius(StashTheme.Radius.card)
            .overlay(
                RoundedRectangle(cornerRadius: StashTheme.Radius.card)
                    .stroke(StashTheme.Color.aiSoft, lineWidth: 1)
            )
            .shadow(
                color: StashTheme.Shadow.subtle.color,
                radius: StashTheme.Shadow.subtle.radius,
                x: StashTheme.Shadow.subtle.x,
                y: StashTheme.Shadow.subtle.y
            )
    }

    /// Pressed state animation
    func pressedScale(_ isPressed: Bool) -> some View {
        self.scaleEffect(isPressed ? 0.98 : 1.0)
            .animation(.easeOut(duration: StashTheme.Motion.fast), value: isPressed)
    }

    /// Apply a subtle animation
    func subtleAnimation() -> some View {
        self.animation(.easeInOut(duration: 0.3), value: UUID())
    }
}

extension Color {
    /// Initialize Color from hex string
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
