# OPA! Santorini
# 🇬🇷 Grieche-CMS - Funktionsumfang & Roadmap

Dieses Dokument beschreibt die geplanten und implementierten Features des Grieche-CMS. Das System ist modular aufgebaut, sodass einzelne Funktionen je nach Bedarf des Restaurant-Betreibers aktiviert oder deaktiviert werden können.

#Optimierungen
Optimierung für alle möglichen Geräte damit immer alles geht

## 🛒 Bestell- & Zahlungssystem (Modular)

### 1. Warenkorb & Live-Kalkulation

- **Interaktiver Warenkorb:** Kunden können Gerichte direkt aus der digitalen Speisekarte in einen Warenkorb legen.
- **Preistransparenz:** Sofortige Anzeige der Gesamtsumme (inkl. MwSt. und ggf. Liefergebühren).
- **Optionale Mengenanpassung:** Schnelles Ändern der Anzahl direkt im Warenkorb-Overlay.

### 2. Bestellung & Abholung (Takeaway)

- **Zeitfenster-Management:** Kunden wählen eine Wunschzeit für die Abholung.
- **Status-Updates:** Der Gast erhält eine Bestätigung (E-Mail/SMS), wenn das Essen vorbereitet wird oder zur Abholung bereitsteht.
- **Bezahloptionen:** Barzahlung bei Abholung oder Online-Zahlung (PayPal, Kreditkarte).

### 3. QR-Pay-at-Table (Premium Modul)

- **Tisch-Scannen:** Jedes Tisch-Set erhält einen eindeutigen QR-Code.
- **Direkt-Check-Out:** Gäste können ihre Rechnung am Tisch einsehen und sofort digital begleichen.
- **Deaktivierbarkeit:** Dieses Modul kann in den Admin-Einstellungen mit einem Klick komplett deaktiviert werden, falls klassischer Service bevorzugt wird.

### 4. Tisch-Reservierung (Online-Buchung)

- **Echtzeit-Verfügbarkeit:** Kunden können Tische direkt über die Website buchen.
- **Kapazitäts-Management:** Automatische Begrenzung der Buchungen basierend auf der Tischanzahl.
- **Bestätigungs-Logik:** Sofortige Bestätigung oder manuelle Freigabe durch den Wirt.

---

## 🍽️ Digitales Menü-Management

- **Responsive Speisekarte:** Optimiert für Smartphones (Mobile-First) mit flüssigen Animationen.
- **Produkt-Optionen:** Auswahl von Beilagen (z.B. Pommes statt Reis) oder Extras (z.B. extra Schafskäse).
- **Allergen-Kennzeichnung:** Rechtlich konforme Darstellung von Zusatzstoffen und Allergenen via Tooltips oder Icons.
- **Tagesgerichte:** Schnelles Einblenden/Ausblenden von wechselnden Spezialitäten (z.B. Lamm-Haxe am Sonntag).

### 5. Administration & Sicherheit (CMS-Panel)

- **Zentrales Login-System:** Sicherer Zugang für den Restaurant-Inhaber über ein verschlüsseltes Portal.
- **Seiten-Management:** Individuelle Login-Berechtigungen für die Bearbeitung spezifischer Seiten (z.B. Menü-Editor vs. Galerie-Verwaltung).
- **Modul-Steuerung:** Zentrale Schaltstelle zum Aktivieren/Deaktivieren von:
  - Warenkorb & Bestellen (Nur Anzeigen der Karte möglich)
  - Abholung & Lieferservice
  - Tisch-Zahlung (QR-Pay)
  - Tisch-Reservierung
- **Lizenz-Integration:**
  - **Zustands-Sync:** Automatische Deaktivierung von Premium-Features (z.B. QR-Pay), wenn die Lizenz abläuft.
  - **Benachrichtigung:** Warnhinweise im Dashboard vor Ablauf der Lizenz (30 Tage, 7 Tage, 1 Tag).
  - **Grace Period:** Pufferzeit für den Weiterbetrieb bei abgelaufener Lizenz (nur für den Gast-Bereich).
- **Kundenberichte (CRM):** Übersicht über Stammkunden, häufig bestellte Gerichte und Reservierungshistorie.
- **Steuersatz-Differenzierung:** Automatische Berechnung von 7% (Mitnahme) vs. 19% (Verzehr vor Ort) MwSt.
- **Lizenz-Validierung:** Abgleich mit dem `Lizenzserver.md` zur Sicherstellung der Domain-Gültigkeit.

---

## 🚀 Zukünftige Ideen (Roadmap)

- [ ] **Gutschein-System:** Verkauf von digitalen Geschenkkarten.
- [ ] **Google Reviews Integration:** Anzeige der neuesten 5-Sterne Bewertungen.
- [ ] **Sammelpass-Digital:** Jede 10. Abhol-Bestellung erhält einen Rabatt.

