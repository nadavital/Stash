import SwiftUI

/// The Search/Stash interface - AI-powered search and conversation
/// Features a prominent orb and beautiful, inviting design
struct SearchView: View {
    @StateObject private var viewModel = SearchViewModel()
    @FocusState private var isSearchFocused: Bool
    @State private var orbExpanded = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Gradient background
                backgroundGradient
                    .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    if viewModel.searchText.isEmpty && viewModel.messages.isEmpty {
                        // Empty state with prominent orb
                        emptyStateView
                    } else if !viewModel.messages.isEmpty {
                        // Conversation view
                        conversationView
                    } else {
                        // Search results
                        searchResultsView
                    }
                    
                    // Input area at bottom
                    inputArea
                }
            }
            .onTapGesture {
                // Dismiss keyboard when tapping outside
                isSearchFocused = false
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Stash")
                        .font(Typography.headline)
                        .foregroundStyle(StashTheme.Color.textPrimary)
                }
                
                // Keyboard dismiss button when keyboard is visible
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        isSearchFocused = false
                    }
                    .fontWeight(.medium)
                }
            }
        }
    }
    
    // MARK: - Background
    
    private var backgroundGradient: some View {
        ZStack {
            StashTheme.Color.bg

            // Subtle glow behind where orb appears
            RadialGradient(
                colors: [
                    StashTheme.Color.accent.opacity(0.06),
                    StashTheme.Color.accent.opacity(0.02),
                    .clear
                ],
                center: .init(x: 0.5, y: 0.25),
                startRadius: 50,
                endRadius: 300
            )
        }
    }
    
    // MARK: - Empty State (Synapse Lens Front & Center)

    @State private var lensState: SynapseLensState = .idle
    @State private var showLensDemo = false

    private var emptyStateView: some View {
        ScrollView {
            VStack(spacing: Spacing.xxl) {
                Spacer(minLength: 60)

                // The Synapse Lens - large and prominent
                SynapseLensView(size: 200, state: lensState)
                    .onTapGesture {
                        isSearchFocused = true
                    }
                    .onLongPressGesture {
                        Haptics.medium()
                        showLensDemo = true
                    }
                    .sheet(isPresented: $showLensDemo) {
                        LensDemoSheet()
                    }
                
                // Welcome text
                VStack(spacing: Spacing.sm) {
                    Text("What can I help you find?")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textPrimary)
                    
                    Text("Search your stash or ask me anything")
                        .font(Typography.body)
                        .foregroundStyle(StashTheme.Color.textSecondary)
                }
                
                // Quick suggestions as pills
                VStack(spacing: Spacing.lg) {
                    suggestionPills(
                        suggestions: [
                            "What recipes did I save?",
                            "Find articles about design",
                            "Something for date night"
                        ]
                    )
                    
                    suggestionPills(
                        suggestions: [
                            "What would Jake like?",
                            "Show me music",
                            "Recent videos"
                        ]
                    )
                }
                .padding(.top, Spacing.lg)
                
                Spacer(minLength: 120)
            }
            .padding(.horizontal)
        }
    }
    
    private func suggestionPills(suggestions: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.sm) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        Haptics.light()
                        viewModel.searchText = suggestion
                        viewModel.sendMessage()
                    } label: {
                        Text(suggestion)
                            .font(Typography.body)
                            .foregroundStyle(StashTheme.Color.textPrimary)
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.sm)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                            .overlay(
                                Capsule()
                                    .stroke(StashTheme.Color.borderSubtle, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }
    
    // MARK: - Conversation View
    
    private var conversationView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: Spacing.md) {
                    // Small lens at top of conversation
                    AdaptiveSynapseLens(size: 48, state: lensState)
                        .padding(.vertical, Spacing.md)
                    
                    ForEach(viewModel.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                    
                    if viewModel.isLoading {
                        LoadingBubble()
                    }
                }
                .padding()
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                withAnimation {
                    proxy.scrollTo(viewModel.messages.last?.id, anchor: .bottom)
                }
            }
        }
    }
    
    // MARK: - Search Results
    
    private var searchResultsView: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.md) {
                ForEach(viewModel.searchResults) { item in
                    SearchResultCard(item: item)
                }
            }
            .padding()
        }
    }
    
    // MARK: - Input Area
    
    private var inputArea: some View {
        VStack(spacing: 0) {
            Divider()
                .opacity(0.5)
            
            HStack(spacing: Spacing.md) {
                // Text input with glass effect
                HStack(spacing: Spacing.sm) {
                    // Stash glyph indicator
                    StashGlyph(size: 22, color: StashTheme.Color.textMuted)

                    TextField("Ask Stash anything...", text: $viewModel.searchText, axis: .vertical)
                        .font(Typography.body)
                        .focused($isSearchFocused)
                        .lineLimit(1...4)
                        .submitLabel(.send)
                        .onSubmit {
                            viewModel.sendMessage()
                        }
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(StashTheme.Color.borderSubtle, lineWidth: 1)
                )
                
                // Send button
                Button {
                    viewModel.sendMessage()
                } label: {
                    Image(systemName: viewModel.searchText.isEmpty ? "mic.fill" : "arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(
                            viewModel.searchText.isEmpty
                                ? StashTheme.Color.textMuted
                                : StashTheme.Color.accent
                        )
                        .clipShape(Circle())
                }
                .disabled(viewModel.searchText.isEmpty && !viewModel.isVoiceEnabled)
                .animation(.easeInOut(duration: 0.15), value: viewModel.searchText.isEmpty)
            }
            .padding()
            .background(StashTheme.Color.bg.opacity(0.8))
        }
    }
}

// MARK: - Message Bubble

struct MessageBubble: View {
    let message: ChatMessage
    
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            if message.isUser {
                Spacer(minLength: 60)
            } else {
                // Synapse lens indicator
                AdaptiveSynapseLens(size: 28, state: .idle)
                    .padding(.top, 4)
            }
            
            VStack(alignment: message.isUser ? .trailing : .leading, spacing: Spacing.sm) {
                Text(message.text)
                    .font(Typography.body)
                    .foregroundStyle(message.isUser ? .white : StashTheme.Color.textPrimary)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(
                        message.isUser
                            ? StashTheme.Color.accent
                            : StashTheme.Color.surface
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                
                // Show items if present
                if !message.referencedItems.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.sm) {
                            ForEach(message.referencedItems) { item in
                                CompactResultCard(item: item)
                            }
                        }
                    }
                }
            }
            
            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Loading Bubble

struct LoadingBubble: View {
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            AdaptiveSynapseLens(size: 32, state: .thinking)
                .padding(.top, 4)

            Spacer(minLength: 60)
        }
    }
}

// MARK: - Search Result Card

struct SearchResultCard: View {
    let item: ItemSummary
    
    var body: some View {
        NavigationLink {
            ItemDetailRouter(item: item)
        } label: {
            HStack(spacing: Spacing.md) {
                // Emoji icon
                Text(item.primaryEmoji)
                    .font(.system(size: 32))
                    .frame(width: 50, height: 50)
                    .background(StashTheme.Color.surfaceSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(Typography.body.weight(.semibold))
                        .foregroundStyle(StashTheme.Color.textPrimary)
                        .lineLimit(1)
                    
                    Text(item.summary)
                        .font(Typography.caption)
                        .foregroundStyle(StashTheme.Color.textSecondary)
                        .lineLimit(2)
                    
                    HStack(spacing: Spacing.xs) {
                        Text(item.type.displayName)
                            .font(Typography.caption2)
                            .foregroundStyle(StashTheme.Color.textMuted)
                        
                        if let source = item.metadata.sourceName {
                            Text("•")
                                .foregroundStyle(StashTheme.Color.textMuted)
                            Text(source)
                                .font(Typography.caption2)
                                .foregroundStyle(StashTheme.Color.textMuted)
                        }
                    }
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            .padding()
            .background(StashTheme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact Result Card

struct CompactResultCard: View {
    let item: ItemSummary
    
    var body: some View {
        NavigationLink {
            ItemDetailRouter(item: item)
        } label: {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(item.primaryEmoji)
                    .font(.system(size: 24))
                
                Text(item.title)
                    .font(Typography.caption.weight(.medium))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(2)
                
                Text(item.type.displayName)
                    .font(Typography.caption2)
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            .frame(width: 130, alignment: .leading)
            .padding()
            .background(StashTheme.Color.surfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Lens Demo Sheet

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

    // Export app icon background
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

// MARK: - Preview

#Preview {
    SearchView()
}
