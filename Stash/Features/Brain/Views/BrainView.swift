import SwiftUI

/// Brain tab - chat with your stash
struct BrainView: View {
    var prefillPrompt: String? = nil
    var focusedItemId: String? = nil
    
    @StateObject private var viewModel = BrainViewModel()
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Suggested prompts (show when no messages)
                if viewModel.messages.isEmpty {
                    VStack(spacing: 20) {
                        // AI brain icon with subtle glow
                        ZStack {
                            Circle()
                                .fill(StashTheme.Color.aiSoft)
                                .frame(width: 100, height: 100)
                            
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 50))
                                .foregroundColor(StashTheme.Color.ai)
                        }

                        Text("Chat with your stash")
                            .font(StashTypography.pageTitle)
                            .foregroundColor(StashTheme.Color.textPrimary)

                        Text("Ask me anything about what you've saved")
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)

                        SuggestedPrompts { prompt in
                            Task {
                                await viewModel.sendSuggestedPrompt(prompt)
                            }
                        }
                    }
                    .frame(maxHeight: .infinity)
                } else {
                    // Messages
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(viewModel.messages) { message in
                                    ChatBubbleView(message: message)
                                        .id(message.id)
                                }

                                if viewModel.isLoading {
                                    AITypingIndicator()
                                        .id("typing")
                                }
                            }
                            .padding(.vertical)
                        }
                        .onChange(of: viewModel.messages.count) { _, _ in
                            scrollToBottom(proxy: proxy)
                        }
                        .onChange(of: viewModel.isLoading) { _, isLoading in
                            if isLoading {
                                scrollToBottom(proxy: proxy)
                            }
                        }
                    }
                }

                // Input field
                HStack(spacing: 12) {
                    TextField("Ask about your stash...", text: $viewModel.inputText)
                        .font(StashTypography.body)
                        .padding(12)
                        .background(StashTheme.Color.surfaceSoft)
                        .cornerRadius(StashTheme.Radius.card)
                        .focused($isInputFocused)
                        .onSubmit {
                            Task {
                                await viewModel.sendMessage()
                            }
                        }

                    Button {
                        Task {
                            await viewModel.sendMessage()
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(viewModel.inputText.isEmpty ? StashTheme.Color.textMuted : StashTheme.Color.ai)
                    }
                    .disabled(viewModel.inputText.isEmpty || viewModel.isLoading)
                }
                .padding()
                .background(StashTheme.Color.surface)
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Brain")
            .onAppear {
                // Handle prefill on initial appearance
                if let prompt = prefillPrompt, !prompt.isEmpty {
                    Task {
                        await viewModel.sendSuggestedPrompt(prompt, focusedItemId: focusedItemId)
                    }
                }
            }
            .onChange(of: prefillPrompt) { _, newPrompt in
                if let prompt = newPrompt, !prompt.isEmpty {
                    Task {
                        await viewModel.sendSuggestedPrompt(prompt, focusedItemId: focusedItemId)
                    }
                }
            }
        }
    }
    
    private func scrollToBottom(proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            if viewModel.isLoading {
                proxy.scrollTo("typing", anchor: .bottom)
            } else if let lastMessage = viewModel.messages.last {
                proxy.scrollTo(lastMessage.id, anchor: .bottom)
            }
        }
    }
}

#Preview {
    BrainView()
}
