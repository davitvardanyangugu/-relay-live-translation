# Relay iOS app

This folder contains the SwiftUI source files for the Relay iPhone/iPad app.

The first version is a native SwiftUI shell around the live Relay web app:

https://relay-production-0ef7.up.railway.app

## Create the Xcode project

1. Open Xcode.
2. File -> New -> Project.
3. Choose iOS -> App.
4. Product Name: Relay
5. Interface: SwiftUI
6. Language: Swift
7. Choose your Personal Team when signing.
8. Save the Xcode project inside this repository's `ios` folder.
9. Replace the generated `RelayApp.swift` and `ContentView.swift` with the files in `ios/Relay`.
10. Add `RelayWebView.swift` to the Relay target.
11. Build and run on your iPad.

## App icon

In Xcode open:

Assets.xcassets -> AppIcon

Use a square 1024 x 1024 PNG with no transparent background. Xcode can generate the required device sizes from the single 1024px icon on current iOS project templates.
