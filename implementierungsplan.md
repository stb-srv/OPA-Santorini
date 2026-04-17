📋 Implementierungsplan – OPA-Santorini CMS Phase 2
Kontext & Regeln für den Agenten
Dateipfad: cms/modules/menu.js (SHA: 378772ce08634e81e93d3dd26ee68916fb0d2093)
Keine anderen Dateien anfassen. Kein Backend-Code ändern. Nur menu.js bearbeiten.
Immer den kompletten Dateiinhalt pushen (kein Partial-Update).
SHA muss beim Push korrekt angegeben werden – vorher mit get_file_contents den aktuellen SHA holen.

Feature 1 – Drag & Drop Sortierung 🔀
Was
Gerichte innerhalb einer Kategorie per Drag & Drop umsortieren. Die neue Reihenfolge wird persistent per POST /api/menu/reorder gespeichert.

Wie – Schritt für Schritt
Schritt 1.1 – SortableJS lazy laden
In attachMenuHandlers(), nach dem Render der Tabelle:

js
async function initSortable(container, safeMenu) {
if (!window.Sortable) {
await new Promise((resolve, reject) => {
const s = document.createElement('script');
s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
s.onload = resolve; s.onerror = reject;
document.head.appendChild(s);
});
}
// ... (siehe Schritt 1.2)
}
Schritt 1.2 – Sortable instanziieren
Nur auf <tbody> der Tabelle, nur wenn cmsSort === 'name' und kein Filter aktiv:

js
const tbody = container.querySelector('.premium-table tbody');
if (!tbody) return;
new window.Sortable(tbody, {
animation: 150,
handle: '.drag-handle', // eigener Handle-Button
filter: '.cat-header-row', // Kategorie-Zeilen NICHT ziehbar
onEnd: async (evt) => {
// IDs der Zeilen in neuer Reihenfolge auslesen
// via apiPost('menu/reorder', { ids: [...] })
// danach cachedMenuData.menu umsortieren + renderMenu()
}
});
Schritt 1.3 – Drag-Handle in renderDishRow()
Neue erste Spalte (vor NR):

xml

<td class="drag-handle" style="cursor:grab;padding:0 8px;opacity:.3;">
    <i class="fas fa-grip-vertical"></i>
</td>
Tabellen-Header um eine <th style="width:24px;"></th> erweitern. colspan aller cat-header-row-Zeilen auf 8 erhöhen.

Schritt 1.4 – Backend-Endpoint (einzige Backend-Änderung)
In server/routes/menu.js nach dem PUT /menu/:id Block einfügen:

js
router.post('/menu/reorder', requireAuth, async (req, res) => {
try {
const { ids } = req.body; // Array von Dish-IDs in neuer Reihenfolge
if (!Array.isArray(ids)) return res.status(400).json({ success: false });
const menu = await DB.getMenu();
const reordered = ids.map(id => menu.find(d => String(d.id) === String(id))).filter(Boolean);
// Nicht enthaltene Gerichte ans Ende hängen
menu.forEach(d => { if (!ids.includes(String(d.id))) reordered.push(d); });
await DB.saveMenu(reordered);
res.json({ success: true });
} catch(e) { res.status(500).json({ success: false, reason: e.message }); }
});
Schritt 1.5 – UI-Hinweis
Wenn useGroupedView aktiv: kleiner Hinweis-Text unter dem Toolbar:

text
<span style="font-size:.75rem;opacity:.4;"><i class="fas fa-grip-vertical"></i> Zeilen ziehen zum Sortieren</span>
Wenn Filter/Suche aktiv: Hinweis ausblenden + Sortable nicht initialisieren.

Feature 2 – Verbesserter PDF-Export 📄
Was
Das bestehende btn-export-pdf ersetzt durch ein deutlich schöneres, zweispaltiges PDF mit:

Restaurant-Logo (falls branding.logo vorhanden)

Kategorie-Überschriften als farbige Trennzeilen

Allergene/Zusatzstoffe als kleine Codes hinter dem Namen

Nicht-verfügbare Gerichte ausblenden (oder optional als durchgestrichen)

Fußzeile mit Datum und „Powered by OPA!"

Wie – Schritt für Schritt
Schritt 2.1 – PDF-Button erweitern
Den bestehenden pdfBtn.onclick Handler vollständig ersetzen:

js
pdfBtn.onclick = async () => {
const { jsPDF } = window.jspdf;
if (!jsPDF) return showToast('jsPDF nicht geladen', 'error');

    // Branding holen
    const branding = await apiGet('branding').catch(() => ({}));
    const resName  = branding?.name || document.getElementById('disp-res-name')?.textContent || 'Speisekarte';
    const today    = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW  = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(27, 58, 92);
    doc.rect(0, 0, PW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text(resName.toUpperCase(), 14, 13);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 169, 110);
    doc.text('SPEISEKARTE', 14, 21);
    doc.setTextColor(255,255,255);
    doc.text(`Stand: ${today}`, PW - 14, 21, { align: 'right' });

    // Nur verfügbare Gerichte
    const availableMenu = [...safeMenu]
        .filter(d => d.available !== false)
        .sort((a, b) => getCatLabel(a.cat).localeCompare(getCatLabel(b.cat)));

    // Tabellendaten aufbauen
    const body = [];
    let curCat = '';
    availableMenu.forEach(d => {
        const cat = getCatLabel(d.cat);
        if (cat !== curCat) {
            curCat = cat;
            body.push([{
                content: cat.toUpperCase(),
                colSpan: 3,
                styles: { fillColor: [200,169,110], textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 }
            }]);
        }
        const codes = [
            ...(d.allergens || []),
            ...(d.additives || [])
        ].join(', ');
        body.push([
            { content: d.number || '–', styles: { halign: 'center', fontSize: 8 } },
            { content: d.name + (d.desc ? `\n${d.desc}` : '') + (codes ? `\n(${codes})` : ''), styles: { fontSize: 8 } },
            { content: `${parseFloat(d.price).toFixed(2)} €`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } }
        ]);
    });

    doc.autoTable({
        startY: 34,
        head: [['Nr.', 'Gericht', 'Preis']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [27, 58, 92], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 22 } },
        styles: { font: 'helvetica', cellPadding: 3, overflow: 'linebreak' },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
            // Fußzeile auf jeder Seite
            const pageH = doc.internal.pageSize.getHeight();
            doc.setFontSize(7); doc.setTextColor(150);
            doc.text(`Seite ${data.pageNumber}`, 14, pageH - 8);
            doc.text('Powered by OPA! Restaurant System', PW - 14, pageH - 8, { align: 'right' });
        }
    });

    doc.save(`speisekarte_${today.replace(/\./g,'-')}.pdf`);

};
Zusammenfassung – Was der Agent pushen muss
Datei Änderung
cms/modules/menu.js SortableJS lazy load + Handle-Spalte + onEnd-Handler + neuer PDF-Handler
server/routes/menu.js Neuer POST /menu/reorder Endpoint
Kritische Regeln
✅ Aktuellen SHA von beiden Dateien vor dem Push abfragen

✅ Beide Dateien als vollständigen Inhalt pushen (kein Diff)

✅ filter: '.cat-header-row' in Sortable setzen – sonst sind Kategoriezeilen versehentlich ziehbar

✅ Sortable nur initialisieren wenn useGroupedView === true (kein Filter, kein Suchbegriff, Sort = Name)

✅ Nach onEnd: zuerst Cache aktualisieren, dann renderMenu() – nicht forceRefresh: true (würde API neu laden und Reihenfolge überschreiben)

❌ Keine anderen Dateien anfassen

❌ Kein npm install – SortableJS kommt via CDN
