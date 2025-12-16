import SwiftUI

/// Demo sheet showing Synapse Lens and Stash Glyph in all states/sizes
/// Accessible via long-press on Synapse Lens in Search/Chat
struct LensDemoSheet: View {
    @Environment(\.dismiss) var dismiss
    @State private var showingSaveSuccess = false
    @State private var selectedPalette: LensColorPalette = .cosmic

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 50) {
                    // MARK: - Color Palette Picker

                    VStack(spacing: 16) {
                        Text("COLOR PALETTE")
                            .font(.system(.caption, design: .monospaced))
                            .fontWeight(.bold)
                            .foregroundStyle(.secondary)
                            .tracking(3)

                        // Compact grid of palette options
                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12)
                        ], spacing: 12) {
                            ForEach(LensColorPalette.allCases) { palette in
                                Button {
                                    Haptics.light()
                                    selectedPalette = palette
                                } label: {
                                    VStack(spacing: 6) {
                                        // Compact color preview
                                        HStack(spacing: 2) {
                                            ForEach(0..<4, id: \.self) { index in
                                                Circle()
                                                    .fill(palette.colors[index])
                                                    .frame(width: 10, height: 10)
                                            }
                                        }
                                        .padding(8)
                                        .background(selectedPalette == palette ? StashTheme.Color.accent.opacity(0.15) : Color(.systemGray6))
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(selectedPalette == palette ? StashTheme.Color.accent : Color.clear, lineWidth: 2)
                                        )

                                        Text(palette.rawValue)
                                            .font(.system(size: 9, weight: .medium))
                                            .foregroundStyle(selectedPalette == palette ? StashTheme.Color.accent : .secondary)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.7)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    .padding(.top, 20)

                    // MARK: - App Icon Export

                    VStack(spacing: 20) {
                        Text("APP ICON BACKGROUND")
                            .font(.system(.caption, design: .monospaced))
                            .fontWeight(.bold)
                            .foregroundStyle(.secondary)
                            .tracking(3)

                        Text("Export selected palette for app icon (light & dark)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)

                        Button {
                            exportAppIconBackground()
                        } label: {
                            HStack {
                                Image(systemName: "square.and.arrow.down")
                                Text("Export to Photos")
                                    .fontWeight(.semibold)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(StashTheme.Color.accent)
                            .clipShape(Capsule())
                        }

                        if showingSaveSuccess {
                            Text("Saved to Photos!")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }

                    Divider()
                        .padding(.vertical, 10)

                    // MARK: - Synapse Lens Section

                    VStack(spacing: 8) {
                        Text("SYNAPSE LENS")
                            .font(.system(.caption, design: .monospaced))
                            .fontWeight(.bold)
                            .foregroundStyle(.secondary)
                            .tracking(3)
                        Text("Liquid Bioluminescence + Glass Effect")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    // Light Background - All States
                    VStack(spacing: 30) {
                        Text("On Light Background")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(spacing: 40) {
                            lensStateDisplay(title: "Idle", state: .idle, description: "Gentle breathing, calm focus", palette: selectedPalette)
                            lensStateDisplay(title: "Listening", state: .listening, description: "Deep breath, receptive", palette: selectedPalette)
                            lensStateDisplay(title: "Thinking", state: .thinking, description: "Fast breathing, active processing", palette: selectedPalette)
                            lensStateDisplay(title: "Answering", state: .answering, description: "Steady flow, delivering response", palette: selectedPalette)
                        }
                        .padding(40)
                        .frame(maxWidth: .infinity)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(color: .black.opacity(0.05), radius: 15, y: 8)
                    }

                    // Dark Background - All States
                    VStack(spacing: 30) {
                        Text("On Dark Background")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(spacing: 40) {
                            lensStateDisplay(title: "Idle", state: .idle, description: "Gentle breathing, calm focus", palette: selectedPalette, isDark: true)
                            lensStateDisplay(title: "Listening", state: .listening, description: "Deep breath, receptive", palette: selectedPalette, isDark: true)
                            lensStateDisplay(title: "Thinking", state: .thinking, description: "Fast breathing, active processing", palette: selectedPalette, isDark: true)
                            lensStateDisplay(title: "Answering", state: .answering, description: "Steady flow, delivering response", palette: selectedPalette, isDark: true)
                        }
                        .padding(40)
                        .frame(maxWidth: .infinity)
                        .background(Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(color: .black.opacity(0.3), radius: 15, y: 8)
                    }

                    Divider()
                        .padding(.vertical, 10)

                    // MARK: - Stash Glyph Section

                    VStack(spacing: 8) {
                        Text("STASH GLYPH")
                            .font(.system(.caption, design: .monospaced))
                            .fontWeight(.bold)
                            .foregroundStyle(.secondary)
                            .tracking(3)
                        Text("Two circles representing connections")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    // Light Background Glyphs
                    VStack(spacing: 30) {
                        Text("On Light Background")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(spacing: 30) {
                            ForEach([64, 48, 32, 24], id: \.self) { size in
                                VStack(spacing: 16) {
                                    StashGlyph(size: CGFloat(size), color: .black)
                                    Text("\(size)pt")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(40)
                        .frame(maxWidth: .infinity)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(color: .black.opacity(0.05), radius: 15, y: 8)
                    }

                    // Dark Background Glyphs
                    VStack(spacing: 30) {
                        Text("On Dark Background")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(spacing: 30) {
                            ForEach([64, 48, 32, 24], id: \.self) { size in
                                VStack(spacing: 16) {
                                    StashGlyph(size: CGFloat(size), color: .white)
                                    Text("\(size)pt")
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.7))
                                }
                            }
                        }
                        .padding(40)
                        .frame(maxWidth: .infinity)
                        .background(Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(color: .black.opacity(0.3), radius: 15, y: 8)
                    }

                    // Colored Glyphs
                    VStack(spacing: 30) {
                        Text("Colored")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(spacing: 30) {
                            StashGlyph(size: 64, color: StashTheme.Color.accent)
                            StashGlyph(size: 64, color: .blue)
                            StashGlyph(size: 64, color: .purple)
                            StashGlyph(size: 64, color: .green)
                            StashGlyph(size: 64, color: StashTheme.Color.success)
                        }
                        .padding(40)
                        .frame(maxWidth: .infinity)
                        .background(Color.gray.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                    }
                }
                .padding(20)
                .padding(.bottom, 40)
            }
            .background(Color(.systemGroupedBackground))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: - Export App Icon Background

    private func exportAppIconBackground() {
        // Export selected palette with both background colors
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // Selected palette - dark background
            let darkBg = AppIconBackgroundView(backgroundColor: .black, palette: selectedPalette)
            let darkRenderer = ImageRenderer(content: darkBg)
            darkRenderer.scale = 3.0
            if let image = darkRenderer.uiImage {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            }

            // Selected palette - white background
            let lightBg = AppIconBackgroundView(backgroundColor: .white, palette: selectedPalette)
            let lightRenderer = ImageRenderer(content: lightBg)
            lightRenderer.scale = 3.0
            if let image = lightRenderer.uiImage {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)

                withAnimation {
                    showingSaveSuccess = true
                }

                // Hide success message after 2 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation {
                        showingSaveSuccess = false
                    }
                }
            }
        }
    }

    // MARK: - Lens State Display

    @ViewBuilder
    private func lensStateDisplay(title: String, state: SynapseLensState, description: String, palette: LensColorPalette, isDark: Bool = false) -> some View {
        VStack(spacing: 20) {
            SynapseLensView(size: 180, state: state, palette: palette)

            VStack(spacing: 6) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(isDark ? .white : .primary)
                Text(description)
                    .font(.caption)
                    .foregroundStyle(isDark ? .white.opacity(0.6) : .secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - App Icon Background View

struct AppIconBackgroundView: View {
    let particles: [LensParticle]
    let backgroundColor: Color

    init(backgroundColor: Color = .black, palette: LensColorPalette = .cosmic) {
        self.backgroundColor = backgroundColor
        let colors = palette.colors

        // Generate particles immediately in init - centered distribution
        var newParticles: [LensParticle] = []
        let particleCount = 150 // Lots of particles for rich appearance

        for _ in 0..<particleCount {
            // Use centered distribution with bias toward middle
            let x = CGFloat.random(in: 0...1)
            let y = CGFloat.random(in: 0...1)

            newParticles.append(LensParticle(
                x: x,
                y: y,
                size: CGFloat.random(in: 80...140), // Large particles for app icon
                color: colors.randomElement()!,
                baseSpeedX: 0,
                baseSpeedY: 0
            ))
        }
        particles = newParticles
    }

    var body: some View {
        ZStack {
            // Background color (can be white or black)
            backgroundColor

            // Particle system only - no glass effect
            Canvas { context, canvasSize in
                for particle in particles {
                    // Center the particles by offsetting from edges
                    let rect = CGRect(
                        x: particle.x * canvasSize.width - particle.size * 0.25,
                        y: particle.y * canvasSize.height - particle.size * 0.25,
                        width: particle.size * 1.5,
                        height: particle.size * 1.5
                    )
                    context.fill(Path(ellipseIn: rect), with: .color(particle.color))
                }
            }
            .blur(radius: 30) // Heavy blur for metaball effect
        }
        .frame(width: 1024, height: 1024) // App icon size
    }
}
