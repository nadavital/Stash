import SwiftUI

/// Recipe detail view (placeholder - to be implemented)
struct RecipeContentView: View {
    let item: ItemSummary

    var body: some View {
        Text("Recipe view coming soon")
            .font(.system(size: 17))
            .foregroundStyle(.white.opacity(0.6))
            .padding()
            .frame(maxWidth: .infinity)
            .background(.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
