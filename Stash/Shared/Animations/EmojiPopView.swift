import SwiftUI

/// A view that displays emoji particles bursting outward from a point
struct EmojiPopView: View {
    let emoji: String
    let particleCount: Int
    
    @State private var particles: [EmojiParticle] = []
    @State private var isAnimating = false
    
    init(emoji: String = "❤️", particleCount: Int = 6) {
        self.emoji = emoji
        self.particleCount = particleCount
    }
    
    var body: some View {
        ZStack {
            ForEach(particles) { particle in
                Text(particle.emoji)
                    .font(.system(size: particle.size))
                    .offset(x: isAnimating ? particle.endX : 0,
                            y: isAnimating ? particle.endY : 0)
                    .opacity(isAnimating ? 0 : 1)
                    .scaleEffect(isAnimating ? 0.3 : 1)
            }
        }
        .onAppear {
            generateParticles()
            withAnimation(.easeOut(duration: 0.6)) {
                isAnimating = true
            }
        }
    }
    
    private func generateParticles() {
        particles = (0..<particleCount).map { i in
            let angle = (Double(i) / Double(particleCount)) * 2 * .pi + Double.random(in: -0.3...0.3)
            let distance = CGFloat.random(in: 30...60)
            return EmojiParticle(
                emoji: emoji,
                size: CGFloat.random(in: 14...22),
                endX: cos(angle) * distance,
                endY: sin(angle) * distance
            )
        }
    }
}

/// A single emoji particle
private struct EmojiParticle: Identifiable {
    let id = UUID()
    let emoji: String
    let size: CGFloat
    let endX: CGFloat
    let endY: CGFloat
}

/// A view modifier that triggers an emoji pop animation
struct EmojiPopModifier: ViewModifier {
    @Binding var isTriggered: Bool
    let emoji: String
    
    @State private var showPop = false
    
    func body(content: Content) -> some View {
        content
            .overlay {
                if showPop {
                    EmojiPopView(emoji: emoji)
                        .allowsHitTesting(false)
                }
            }
            .onChange(of: isTriggered) { oldValue, newValue in
                if newValue && !oldValue {
                    triggerPop()
                }
            }
    }
    
    private func triggerPop() {
        showPop = true
        // Reset after animation completes
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            showPop = false
            isTriggered = false
        }
    }
}

extension View {
    /// Adds an emoji pop animation that triggers when the binding becomes true
    func emojiPop(isTriggered: Binding<Bool>, emoji: String = "❤️") -> some View {
        modifier(EmojiPopModifier(isTriggered: isTriggered, emoji: emoji))
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        EmojiPopView(emoji: "❤️")
        EmojiPopView(emoji: "👍")
        EmojiPopView(emoji: "✨")
    }
}
