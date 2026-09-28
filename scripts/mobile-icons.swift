// Package the existing brand artwork into native app-icon sizes. No redrawing.
// Run from the repository root: swift scripts/mobile-icons.swift
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = CGImageSourceCreateWithURL(root.appendingPathComponent("public/logo.png") as CFURL, nil)!
let logo = CGImageSourceCreateImageAtIndex(source, 0, nil)!

func export(_ name: String, size: Int, transparent: Bool = false, artwork: Bool = true) throws {
    let info = transparent ? CGImageAlphaInfo.premultipliedLast : CGImageAlphaInfo.noneSkipLast
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                            bytesPerRow: size * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: info.rawValue)!
    if !transparent {
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    }
    context.interpolationQuality = .high
    if artwork { context.draw(logo, in: CGRect(x: 0, y: 0, width: size, height: size)) }
    let destination = root.appendingPathComponent(name)
    try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
    let output = CGImageDestinationCreateWithURL(destination as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(output, context.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(output), "Could not write \(name)")
}

try export("resources/icon.png", size: 1024)
try export("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", size: 1024)
try export("artifacts/mobile/play-store-icon.png", size: 512)
for (density, size, adaptive) in [("ldpi",36,81),("mdpi",48,108),("hdpi",72,162),("xhdpi",96,216),("xxhdpi",144,324),("xxxhdpi",192,432)] {
    let directory = "android/app/src/main/res/mipmap-\(density)"
    try export("\(directory)/ic_launcher.png", size: size)
    try export("\(directory)/ic_launcher_round.png", size: size)
    try export("\(directory)/ic_launcher_foreground.png", size: adaptive, transparent: true)
    try export("\(directory)/ic_launcher_background.png", size: adaptive, artwork: false)
}
print("Native icons exported from public/logo.png")
