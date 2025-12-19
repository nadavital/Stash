import Foundation

extension Array {
    /// Safe subscript that returns nil if index is out of bounds
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
