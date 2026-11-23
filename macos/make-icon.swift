// Fabrique l'image maîtresse de l'icône (1024 × 1024) à partir du logo fourni :
// un carré noir aux coins arrondis, le logo inchangé posé au centre à l'échelle 1
// (chaque pixel du logo reste un pixel), cerné d'un liseré blanc qui suit sa
// silhouette pour le détacher du fond.
//
// Utilisation : swift make-icon.swift "<logo.png>" "<icone-1024.png>"

import AppKit

let args = CommandLine.arguments
guard args.count == 3, let logo = NSImage(contentsOfFile: args[1]),
      let cg = logo.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage : make-icon.swift logo.png sortie.png\n".data(using: .utf8)!)
    exit(1)
}

let side = 1024, border = 7                      // épaisseur du liseré, en pixels
let w = cg.width, h = cg.height
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let info = CGImageAlphaInfo.premultipliedLast.rawValue

// 1. Les pixels du logo (sur blanc, au cas où le fichier aurait de la transparence).
var src = [UInt8](repeating: 255, count: w * h * 4)
src.withUnsafeMutableBytes { raw in
    let c = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space, bitmapInfo: info)!
    c.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); c.fill(CGRect(x: 0, y: 0, width: w, height: h))
    c.interpolationQuality = .none
    c.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
}
func dark(_ i: Int) -> Bool { Int(src[i * 4]) + Int(src[i * 4 + 1]) + Int(src[i * 4 + 2]) < 384 }

// 2. Silhouette : tout ce que le blanc du fond n'atteint pas en partant des bords.
var outside = [Bool](repeating: false, count: w * h)
var stack: [Int] = []
func seed(_ x: Int, _ y: Int) { let i = y * w + x; if !outside[i] && !dark(i) { outside[i] = true; stack.append(i) } }
for x in 0..<w { seed(x, 0); seed(x, h - 1) }
for y in 0..<h { seed(0, y); seed(w - 1, y) }
while let i = stack.popLast() {
    let x = i % w, y = i / w
    if x > 0 { seed(x - 1, y) }; if x < w - 1 { seed(x + 1, y) }
    if y > 0 { seed(x, y - 1) }; if y < h - 1 { seed(x, y + 1) }
}

// 3. Image finale : fond noir, liseré blanc (silhouette épaissie), logo par-dessus.
var out = [UInt8](repeating: 0, count: side * side * 4)
let ox = (side - w) / 2, oy = (side - h) / 2
func put(_ x: Int, _ y: Int, _ r: UInt8, _ g: UInt8, _ b: UInt8) {
    guard x >= 0, y >= 0, x < side, y < side else { return }
    let o = (y * side + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255
}
out.withUnsafeMutableBytes { raw in                                    // plaque noire arrondie (gabarit macOS : 824 px)
    let c = CGContext(data: raw.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4, space: space, bitmapInfo: info)!
    c.addPath(CGPath(roundedRect: CGRect(x: 100, y: 100, width: 824, height: 824), cornerWidth: 184, cornerHeight: 184, transform: nil))
    c.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1)); c.fillPath()
}
var disc: [(Int, Int)] = []
for dy in -border...border { for dx in -border...border where dx * dx + dy * dy <= border * border { disc.append((dx, dy)) } }
for y in 0..<h { for x in 0..<w where !outside[y * w + x] {
    // seuls les pixels du bord de la silhouette ont besoin d'être épaissis
    let edge = x == 0 || y == 0 || x == w - 1 || y == h - 1 || outside[y * w + x - 1] || outside[y * w + x + 1] || outside[(y - 1) * w + x] || outside[(y + 1) * w + x]
    if edge { for (dx, dy) in disc { put(ox + x + dx, oy + y + dy, 255, 255, 255) } }
} }
for y in 0..<h { for x in 0..<w where !outside[y * w + x] {
    let i = (y * w + x) * 4
    put(ox + x, oy + y, src[i], src[i + 1], src[i + 2])
} }

let image = out.withUnsafeMutableBytes { raw in
    CGContext(data: raw.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4, space: space, bitmapInfo: info)!.makeImage()!
}
try! NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
