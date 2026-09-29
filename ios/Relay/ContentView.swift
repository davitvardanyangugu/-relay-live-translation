import SwiftUI

struct ContentView: View {
    var body: some View {
        RelayWebView(url: URL(string: "https://relay-production-0ef7.up.railway.app")!)
            .ignoresSafeArea()
    }
}

#Preview {
    ContentView()
}
