import SwiftUI

struct CountryPickerView: View {
    @Binding var selected: String
    @Environment(\.dismiss) var dismiss
    @State private var search = ""

    private var filtered: [(String, String, String)] {
        let countries = CountryData.all
        if search.isEmpty { return countries }
        let q = search.lowercased()
        return countries.filter { $0.1.lowercased().contains(q) || $0.0.lowercased().contains(q) }
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()
            List {
                // Clear option
                Button {
                    selected = ""
                    dismiss()
                } label: {
                    Text("No country")
                        .foregroundColor(DojoTheme.textMuted)
                }
                .listRowBackground(DojoTheme.piuCard)

                ForEach(filtered, id: \.0) { code, name, flag in
                    Button {
                        selected = code
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            Text(flag)
                                .font(.system(size: 24))
                            Text(name)
                                .foregroundColor(.white)
                            Spacer()
                            if selected == code {
                                Image(systemName: "checkmark")
                                    .foregroundColor(DojoTheme.piuAccent)
                            }
                        }
                    }
                    .listRowBackground(DojoTheme.piuCard)
                }
            }
            .listStyle(.plain)
            .searchable(text: $search, prompt: "Search countries")
        }
        .navigationTitle("Select Country")
        .navigationBarTitleDisplayMode(.inline)
    }
}
