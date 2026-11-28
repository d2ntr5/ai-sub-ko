// 앱 아이콘: 확장 아이콘(파란 네모 · 눈 둘 · 자막 줄 둘)을 macOS 아이콘 틀(1024 안 824 둥근 네모)에 그린다.
//   swift safari/scripts/make-icon.swift safari/App/Assets.xcassets/AppIcon.appiconset
import AppKit

let out = CommandLine.arguments[1]
func draw(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(px) / 1024
    let box = NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
    let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.3); shadow.shadowBlurRadius = 20 * s; shadow.shadowOffset = NSSize(width: 0, height: -8 * s)
    NSGraphicsContext.saveGraphicsState(); shadow.set()
    let path = NSBezierPath(roundedRect: box, xRadius: 185 * s, yRadius: 185 * s)
    NSColor(srgbRed: 0.12, green: 0.36, blue: 0.86, alpha: 1).setFill(); path.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGradient(starting: NSColor(srgbRed: 0.24, green: 0.48, blue: 0.95, alpha: 1), ending: NSColor(srgbRed: 0.06, green: 0.29, blue: 0.76, alpha: 1))!.draw(in: path, angle: -90)
    NSColor.white.setFill()
    for x in [380.0, 644.0] { NSBezierPath(ovalIn: NSRect(x: (x - 52) * s, y: (680 - 52) * s, width: 104 * s, height: 104 * s)).fill() }
    NSBezierPath(roundedRect: NSRect(x: 240 * s, y: 430 * s, width: 544 * s, height: 96 * s), xRadius: 48 * s, yRadius: 48 * s).fill()
    NSBezierPath(roundedRect: NSRect(x: 330 * s, y: 285 * s, width: 364 * s, height: 96 * s), xRadius: 48 * s, yRadius: 48 * s).fill()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
var images: [[String: String]] = []
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try! draw(size * scale).write(to: URL(fileURLWithPath: out).appendingPathComponent(name))
        images.append(["idiom": "mac", "size": "\(size)x\(size)", "scale": "\(scale)x", "filename": name])
    }
}
let json = try! JSONSerialization.data(withJSONObject: ["images": images, "info": ["version": 1, "author": "xcode"]], options: [.prettyPrinted, .sortedKeys])
try! json.write(to: URL(fileURLWithPath: out).appendingPathComponent("Contents.json"))
