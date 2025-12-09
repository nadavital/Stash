import SwiftUI

struct LensParticle: Identifiable {
    let id = UUID()
    var x: CGFloat
    var y: CGFloat
    var size: CGFloat
    var color: Color
    var baseSpeedX: CGFloat
    var baseSpeedY: CGFloat
}

/// Color palette options for the Synapse Lens
public enum LensColorPalette: String, CaseIterable, Identifiable {
    case earthyGreen = "Earthy"
    case oceanGold = "Ocean"
    case sunsetBlush = "Sunset"
    case twilightRose = "Twilight"
    case auroraLime = "Aurora"
    case ember = "Ember"
    case cosmic = "Cosmic"
    case sage = "Sage"
    case peachy = "Peachy"
    case moonlight = "Moonlight"

    public var id: String { rawValue }

    var colors: [Color] {
        switch self {
        case .earthyGreen:
            return [
                Color(red: 0.28, green: 0.65, blue: 0.35),  // Forest Green
                Color(red: 0.35, green: 0.70, blue: 0.42),  // Sage
                Color(red: 0.50, green: 0.68, blue: 0.45),  // Olive
                Color(red: 0.42, green: 0.75, blue: 0.52)   // Moss
            ]
        case .oceanGold:
            return [
                Color(red: 0.12, green: 0.40, blue: 0.70),  // Deep Ocean Blue
                Color(red: 0.18, green: 0.50, blue: 0.75),  // Ocean Blue
                Color(red: 0.85, green: 0.72, blue: 0.30),  // Rich Gold
                Color(red: 0.25, green: 0.58, blue: 0.72)   // Teal
            ]
        case .sunsetBlush:
            return [
                Color(red: 0.98, green: 0.52, blue: 0.35),  // Coral
                Color(red: 0.95, green: 0.65, blue: 0.45),  // Peach
                Color(red: 0.90, green: 0.45, blue: 0.60),  // Rose
                Color(red: 0.98, green: 0.75, blue: 0.50)   // Soft Orange
            ]
        case .twilightRose:
            return [
                Color(red: 0.38, green: 0.22, blue: 0.58),  // Deep Purple
                Color(red: 0.65, green: 0.25, blue: 0.50),  // Magenta
                Color(red: 0.85, green: 0.45, blue: 0.55),  // Dusty Rose
                Color(red: 0.50, green: 0.30, blue: 0.55)   // Plum
            ]
        case .auroraLime:
            return [
                Color(red: 0.18, green: 0.75, blue: 0.88),  // Cyan
                Color(red: 0.40, green: 0.85, blue: 0.75),  // Aqua
                Color(red: 0.65, green: 0.88, blue: 0.45),  // Lime
                Color(red: 0.50, green: 0.80, blue: 0.85)   // Mint
            ]
        case .ember:
            return [
                Color(red: 0.80, green: 0.25, blue: 0.20),  // Deep Red
                Color(red: 0.95, green: 0.50, blue: 0.18),  // Bright Orange
                Color(red: 0.98, green: 0.70, blue: 0.25),  // Golden Yellow
                Color(red: 0.88, green: 0.35, blue: 0.22)   // Red-Orange
            ]
        case .cosmic:
            return [
                Color(red: 0.32, green: 0.18, blue: 0.58),  // Deep Violet (darker)
                Color(red: 0.58, green: 0.22, blue: 0.52),  // Magenta (darker)
                Color(red: 0.22, green: 0.42, blue: 0.72),  // Electric Blue (darker)
                Color(red: 0.42, green: 0.32, blue: 0.68)   // Purple (darker)
            ]
        case .sage:
            return [
                Color(red: 0.45, green: 0.65, blue: 0.55),  // Sage
                Color(red: 0.55, green: 0.70, blue: 0.60),  // Mint
                Color(red: 0.70, green: 0.75, blue: 0.65),  // Cream
                Color(red: 0.50, green: 0.68, blue: 0.58)   // Seafoam
            ]
        case .peachy:
            return [
                Color(red: 0.98, green: 0.68, blue: 0.52),  // Peach
                Color(red: 0.95, green: 0.78, blue: 0.62),  // Apricot
                Color(red: 0.88, green: 0.55, blue: 0.65),  // Blush
                Color(red: 0.92, green: 0.72, blue: 0.58)   // Warm Sand
            ]
        case .moonlight:
            return [
                Color(red: 0.65, green: 0.70, blue: 0.82),  // Periwinkle
                Color(red: 0.75, green: 0.75, blue: 0.80),  // Silver
                Color(red: 0.85, green: 0.82, blue: 0.70),  // Pale Gold
                Color(red: 0.70, green: 0.73, blue: 0.78)   // Cool Gray
            ]
        }
    }

    var description: String {
        switch self {
        case .earthyGreen: return "Forest greens"
        case .oceanGold: return "Deep blue & gold"
        case .sunsetBlush: return "Coral & rose"
        case .twilightRose: return "Purple & rose"
        case .auroraLime: return "Cyan & lime"
        case .ember: return "Fire tones"
        case .cosmic: return "Violet & magenta"
        case .sage: return "Soft mint & cream"
        case .peachy: return "Warm peach"
        case .moonlight: return "Silver & gold"
        }
    }
}

/// The Liquid Bioluminescence Lens
public struct SynapseLensView: View {
    let size: CGFloat
    let state: SynapseLensState
    let palette: LensColorPalette

    @State private var particles: [LensParticle] = []
    @State private var breathingPhase: CGFloat = 0
    @State private var currentBlur: CGFloat = 10
    @State private var currentSpeedMult: CGFloat = 0.5

    private var colors: [Color] {
        palette.colors
    }

    public init(size: CGFloat = 120, state: SynapseLensState = .idle, palette: LensColorPalette = .cosmic) {
        self.size = size
        self.state = state
        self.palette = palette
    }

    func createParticles() {
        var newParticles: [LensParticle] = []
        let sizeRange = state.particleSizeRange(forSize: size)
        let targetCount = state.particleCount(forSize: size)

        for _ in 0..<targetCount {
            newParticles.append(LensParticle(
                x: CGFloat.random(in: 0...1),
                y: CGFloat.random(in: 0...1),
                size: CGFloat.random(in: sizeRange),
                color: colors.randomElement()!,
                baseSpeedX: CGFloat.random(in: -0.003...0.003),
                baseSpeedY: CGFloat.random(in: -0.003...0.003)
            ))
        }
        particles = newParticles
    }

    public var body: some View {
        TimelineView(.animation) { timeline in
            ZStack {
                // 1. THE LIQUID CORE
                // Rendered behind the glass with heavy blur for metaball effect
                Canvas { context, canvasSize in
                    for particle in particles {
                        let rect = CGRect(
                            x: particle.x * canvasSize.width,
                            y: particle.y * canvasSize.height,
                            width: particle.size * 1.5, // Inflate for blur overlap
                            height: particle.size * 1.5
                        )
                        context.fill(Path(ellipseIn: rect), with: .color(particle.color))
                    }
                }
                .blur(radius: currentBlur) // Smoothly interpolated blur
                .opacity(size < 50 ? 1.0 : 0.9) // Full opacity for tiny sizes
                .mask(Circle()) // Keep particles inside circle

                // 2. THE GLASS LENS (Preserved exactly as requested)
                Circle()
                    .fill(.white.opacity(0.01))
                    .glassEffect(.clear, in: .circle)
            }
            .frame(width: size, height: size)
            // 3. SYNCHRONIZED ANIMATIONS
            .scaleEffect(1.0 + breathingOffset)
            .onChange(of: timeline.date) { _, newDate in
                updateParticles()
                // Continuous breathing animation
                breathingPhase = newDate.timeIntervalSinceReferenceDate
            }
            .onChange(of: palette) { _, _ in
                // Recreate particles when palette changes
                createParticles()
            }
            .onAppear {
                if particles.isEmpty {
                    createParticles()
                }
            }
        }
        .frame(width: size, height: size)
    }

    func updateParticles() {
        // Smooth interpolation for blur and speed
        let targetBlur = state.blurAmount(forSize: size)
        let targetSpeed = state.speedMultiplier
        currentBlur += (targetBlur - currentBlur) * 0.1
        currentSpeedMult += (targetSpeed - currentSpeedMult) * 0.1

        // Dynamic population adjustment
        let targetCount = state.particleCount(forSize: size)
        if particles.count < targetCount {
            // Organic growth - add 1 particle per frame
            let sizeRange = state.particleSizeRange(forSize: size)
            particles.append(LensParticle(
                x: CGFloat.random(in: 0...1),
                y: CGFloat.random(in: 0...1),
                size: CGFloat.random(in: sizeRange),
                color: colors.randomElement()!,
                baseSpeedX: CGFloat.random(in: -0.003...0.003),
                baseSpeedY: CGFloat.random(in: -0.003...0.003)
            ))
        } else if particles.count > targetCount {
            // Remove excess particles
            particles.removeLast()
        }

        // Update particle positions with interpolated speed
        for i in particles.indices {
            particles[i].x += particles[i].baseSpeedX * currentSpeedMult
            particles[i].y += particles[i].baseSpeedY * currentSpeedMult

            // Wrap around (Torus topology) for smooth flow
            if particles[i].x < -0.2 { particles[i].x = 1.2 }
            if particles[i].x > 1.2 { particles[i].x = -0.2 }
            if particles[i].y < -0.2 { particles[i].y = 1.2 }
            if particles[i].y > 1.2 { particles[i].y = -0.2 }
        }
    }

    // MARK: - State-driven Parameters

    // Continuous breathing animation offset
    private var breathingOffset: CGFloat {
        return sin(breathingPhase * .pi / state.breathingSpeed) * state.breathingAmplitude
    }
}

// MARK: - Preview

#Preview("Particle Lens") {
    ZStack {
        Color.white.ignoresSafeArea()

        VStack(spacing: 40) {
            Text("THE PARTICLE LENS")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(.black.opacity(0.5))
                .tracking(4)

            SynapseLensView(size: 200, state: .idle)

            Text("A Collection of Ideas")
                .font(.caption2)
                .foregroundColor(.black.opacity(0.3))
        }
    }
}

#Preview("All States") {
    ScrollView {
        VStack(spacing: 50) {
            // Nature Palette
            VStack(spacing: 20) {
                Text("SYNAPSE LENS")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(.black.opacity(0.5))
                    .tracking(4)

                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 30) {
                    ForEach([
                        ("Idle", SynapseLensState.idle),
                        ("Listening", .listening),
                        ("Thinking", .thinking),
                        ("Answering", .answering)
                    ], id: \.0) { name, state in
                        VStack(spacing: 12) {
                            SynapseLensView(size: 100, state: state)

                            Text(name)
                                .font(.caption2)
                                .foregroundColor(.black.opacity(0.6))
                        }
                        .frame(height: 160)
                    }
                }
            }
        }
        .padding(30)
    }
    .background(Color.white)
}

