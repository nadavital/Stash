import SwiftUI

/// The Stash Glyph - Our brand identity icon
/// Two circles representing connections and relationships
public struct StashGlyph: View {
    let size: CGFloat
    let color: Color

    public init(size: CGFloat = 24, color: Color = .primary) {
        self.size = size
        self.color = color
    }

    public var body: some View {
        Image("stash-glyph")
            .resizable()
            .renderingMode(.template)
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .foregroundStyle(color)
    }
}

#Preview("Stash Glyph Sizes") {
    VStack(spacing: 40) {
        VStack(spacing: 20) {
            Text("On Light Background")
                .font(.caption.weight(.semibold))

            HStack(spacing: 30) {
                VStack(spacing: 8) {
                    StashGlyph(size: 64, color: .black)
                    Text("64pt")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 48, color: .black)
                    Text("48pt")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 32, color: .black)
                    Text("32pt")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 24, color: .black)
                    Text("24pt")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 16, color: .black)
                    Text("16pt")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(30)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }

        VStack(spacing: 20) {
            Text("On Dark Background")
                .font(.caption.weight(.semibold))

            HStack(spacing: 30) {
                VStack(spacing: 8) {
                    StashGlyph(size: 64, color: .white)
                    Text("64pt")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 48, color: .white)
                    Text("48pt")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 32, color: .white)
                    Text("32pt")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 24, color: .white)
                    Text("24pt")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
                VStack(spacing: 8) {
                    StashGlyph(size: 16, color: .white)
                    Text("16pt")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .padding(30)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }

        VStack(spacing: 20) {
            Text("Colored")
                .font(.caption.weight(.semibold))

            HStack(spacing: 30) {
                StashGlyph(size: 48, color: StashTheme.Color.accent)
                StashGlyph(size: 48, color: .blue)
                StashGlyph(size: 48, color: .purple)
                StashGlyph(size: 48, color: .green)
            }
        }
    }
    .padding(40)
    .background(Color.gray.opacity(0.1))
}
