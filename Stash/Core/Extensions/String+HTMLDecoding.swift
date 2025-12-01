import Foundation

extension String {
    /// Decodes common HTML entities to their character equivalents
    var htmlDecoded: String {
        var result = self
        
        // Common HTML entities
        let entities: [String: String] = [
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": "\"",
            "&#39;": "'",
            "&apos;": "'",
            "&nbsp;": " ",
            "&ndash;": "–",
            "&mdash;": "—",
            "&lsquo;": "'",
            "&rsquo;": "'",
            "&ldquo;": "\"",
            "&rdquo;": "\"",
            "&hellip;": "…",
            "&copy;": "©",
            "&reg;": "®",
            "&trade;": "™",
            "&deg;": "°",
            "&plusmn;": "±",
            "&times;": "×",
            "&divide;": "÷",
            "&frac12;": "½",
            "&frac14;": "¼",
            "&frac34;": "¾",
        ]
        
        for (entity, character) in entities {
            result = result.replacingOccurrences(of: entity, with: character)
        }
        
        // Handle numeric entities like &#8217; &#x2019;
        // Decimal: &#123;
        let decimalPattern = "&#(\\d+);"
        if let regex = try? NSRegularExpression(pattern: decimalPattern, options: []) {
            let range = NSRange(result.startIndex..., in: result)
            let matches = regex.matches(in: result, options: [], range: range)
            
            // Process in reverse to maintain string indices
            for match in matches.reversed() {
                if let codeRange = Range(match.range(at: 1), in: result),
                   let code = Int(result[codeRange]),
                   let scalar = Unicode.Scalar(code) {
                    let fullRange = Range(match.range, in: result)!
                    result.replaceSubrange(fullRange, with: String(Character(scalar)))
                }
            }
        }
        
        // Hexadecimal: &#x1F4A1;
        let hexPattern = "&#[xX]([0-9a-fA-F]+);"
        if let regex = try? NSRegularExpression(pattern: hexPattern, options: []) {
            let range = NSRange(result.startIndex..., in: result)
            let matches = regex.matches(in: result, options: [], range: range)
            
            for match in matches.reversed() {
                if let codeRange = Range(match.range(at: 1), in: result),
                   let code = Int(result[codeRange], radix: 16),
                   let scalar = Unicode.Scalar(code) {
                    let fullRange = Range(match.range, in: result)!
                    result.replaceSubrange(fullRange, with: String(Character(scalar)))
                }
            }
        }
        
        return result
    }
}
