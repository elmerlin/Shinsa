import Foundation

enum CountryData {
    static let all: [(String, String, String)] = [
        ("AF", "Afghanistan", "🇦🇫"), ("AL", "Albania", "🇦🇱"), ("DZ", "Algeria", "🇩🇿"),
        ("AR", "Argentina", "🇦🇷"), ("AM", "Armenia", "🇦🇲"), ("AU", "Australia", "🇦🇺"),
        ("AT", "Austria", "🇦🇹"), ("AZ", "Azerbaijan", "🇦🇿"), ("BH", "Bahrain", "🇧🇭"),
        ("BD", "Bangladesh", "🇧🇩"), ("BY", "Belarus", "🇧🇾"), ("BE", "Belgium", "🇧🇪"),
        ("BO", "Bolivia", "🇧🇴"), ("BA", "Bosnia and Herzegovina", "🇧🇦"),
        ("BR", "Brazil", "🇧🇷"), ("BN", "Brunei", "🇧🇳"), ("BG", "Bulgaria", "🇧🇬"),
        ("KH", "Cambodia", "🇰🇭"), ("CM", "Cameroon", "🇨🇲"), ("CA", "Canada", "🇨🇦"),
        ("CL", "Chile", "🇨🇱"), ("CN", "China", "🇨🇳"), ("CO", "Colombia", "🇨🇴"),
        ("CR", "Costa Rica", "🇨🇷"), ("HR", "Croatia", "🇭🇷"), ("CU", "Cuba", "🇨🇺"),
        ("CY", "Cyprus", "🇨🇾"), ("CZ", "Czech Republic", "🇨🇿"), ("DK", "Denmark", "🇩🇰"),
        ("DO", "Dominican Republic", "🇩🇴"), ("EC", "Ecuador", "🇪🇨"), ("EG", "Egypt", "🇪🇬"),
        ("SV", "El Salvador", "🇸🇻"), ("EE", "Estonia", "🇪🇪"), ("ET", "Ethiopia", "🇪🇹"),
        ("FI", "Finland", "🇫🇮"), ("FR", "France", "🇫🇷"), ("GE", "Georgia", "🇬🇪"),
        ("DE", "Germany", "🇩🇪"), ("GH", "Ghana", "🇬🇭"), ("GR", "Greece", "🇬🇷"),
        ("GT", "Guatemala", "🇬🇹"), ("HN", "Honduras", "🇭🇳"), ("HK", "Hong Kong", "🇭🇰"),
        ("HU", "Hungary", "🇭🇺"), ("IS", "Iceland", "🇮🇸"), ("IN", "India", "🇮🇳"),
        ("ID", "Indonesia", "🇮🇩"), ("IR", "Iran", "🇮🇷"), ("IQ", "Iraq", "🇮🇶"),
        ("IE", "Ireland", "🇮🇪"), ("IL", "Israel", "🇮🇱"), ("IT", "Italy", "🇮🇹"),
        ("JM", "Jamaica", "🇯🇲"), ("JP", "Japan", "🇯🇵"), ("JO", "Jordan", "🇯🇴"),
        ("KZ", "Kazakhstan", "🇰🇿"), ("KE", "Kenya", "🇰🇪"), ("KR", "South Korea", "🇰🇷"),
        ("KW", "Kuwait", "🇰🇼"), ("KG", "Kyrgyzstan", "🇰🇬"), ("LA", "Laos", "🇱🇦"),
        ("LV", "Latvia", "🇱🇻"), ("LB", "Lebanon", "🇱🇧"), ("LY", "Libya", "🇱🇾"),
        ("LT", "Lithuania", "🇱🇹"), ("LU", "Luxembourg", "🇱🇺"), ("MO", "Macau", "🇲🇴"),
        ("MY", "Malaysia", "🇲🇾"), ("MV", "Maldives", "🇲🇻"), ("MT", "Malta", "🇲🇹"),
        ("MX", "Mexico", "🇲🇽"), ("MD", "Moldova", "🇲🇩"), ("MN", "Mongolia", "🇲🇳"),
        ("ME", "Montenegro", "🇲🇪"), ("MA", "Morocco", "🇲🇦"), ("MZ", "Mozambique", "🇲🇿"),
        ("MM", "Myanmar", "🇲🇲"), ("NP", "Nepal", "🇳🇵"), ("NL", "Netherlands", "🇳🇱"),
        ("NZ", "New Zealand", "🇳🇿"), ("NI", "Nicaragua", "🇳🇮"), ("NG", "Nigeria", "🇳🇬"),
        ("KP", "North Korea", "🇰🇵"), ("MK", "North Macedonia", "🇲🇰"), ("NO", "Norway", "🇳🇴"),
        ("OM", "Oman", "🇴🇲"), ("PK", "Pakistan", "🇵🇰"), ("PS", "Palestine", "🇵🇸"),
        ("PA", "Panama", "🇵🇦"), ("PY", "Paraguay", "🇵🇾"), ("PE", "Peru", "🇵🇪"),
        ("PH", "Philippines", "🇵🇭"), ("PL", "Poland", "🇵🇱"), ("PT", "Portugal", "🇵🇹"),
        ("PR", "Puerto Rico", "🇵🇷"), ("QA", "Qatar", "🇶🇦"), ("RO", "Romania", "🇷🇴"),
        ("RU", "Russia", "🇷🇺"), ("SA", "Saudi Arabia", "🇸🇦"), ("RS", "Serbia", "🇷🇸"),
        ("SG", "Singapore", "🇸🇬"), ("SK", "Slovakia", "🇸🇰"), ("SI", "Slovenia", "🇸🇮"),
        ("ZA", "South Africa", "🇿🇦"), ("ES", "Spain", "🇪🇸"), ("LK", "Sri Lanka", "🇱🇰"),
        ("SD", "Sudan", "🇸🇩"), ("SE", "Sweden", "🇸🇪"), ("CH", "Switzerland", "🇨🇭"),
        ("SY", "Syria", "🇸🇾"), ("TW", "Taiwan", "🇹🇼"), ("TJ", "Tajikistan", "🇹🇯"),
        ("TZ", "Tanzania", "🇹🇿"), ("TH", "Thailand", "🇹🇭"), ("TT", "Trinidad and Tobago", "🇹🇹"),
        ("TN", "Tunisia", "🇹🇳"), ("TR", "Turkey", "🇹🇷"), ("TM", "Turkmenistan", "🇹🇲"),
        ("UG", "Uganda", "🇺🇬"), ("UA", "Ukraine", "🇺🇦"), ("AE", "United Arab Emirates", "🇦🇪"),
        ("GB", "United Kingdom", "🇬🇧"), ("US", "United States", "🇺🇸"), ("UY", "Uruguay", "🇺🇾"),
        ("UZ", "Uzbekistan", "🇺🇿"), ("VE", "Venezuela", "🇻🇪"), ("VN", "Vietnam", "🇻🇳"),
        ("YE", "Yemen", "🇾🇪"), ("ZM", "Zambia", "🇿🇲"), ("ZW", "Zimbabwe", "🇿🇼"),
    ]

    static func flag(for code: String) -> String {
        all.first(where: { $0.0 == code })?.2 ?? ""
    }

    static func name(for code: String) -> String {
        all.first(where: { $0.0 == code })?.1 ?? code
    }
}
