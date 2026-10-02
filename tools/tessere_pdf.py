"""Crea bicchierino-lettere.pdf: istruzioni, schema del cerchio e 40 tessere da ritagliare.

Uso:  python3 tools/tessere_pdf.py
Serve il carattere IM Fell English (file IMFeENrm28P.ttf e IMFeENit28P.ttf) nella cartella tools/fonts.
"""
import math
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path(__file__).resolve().parent / 'fonts'
pdfmetrics.registerFont(TTFont('Fell', str(FONTS / 'IMFeENrm28P.ttf')))
pdfmetrics.registerFont(TTFont('FellIt', str(FONTS / 'IMFeENit28P.ttf')))

INK = (0.12, 0.09, 0.11)
GREY = (0.55, 0.55, 0.55)
W, H = A4
LETTERS = list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
TILES = LETTERS + list('0123456789') + ['Sì', 'No', 'Addio', 'Inizio']


def wrap(c, text, font, size, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if pdfmetrics.stringWidth(t, font, size) <= width:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def paragraph(c, text, x, y, width, font='Fell', size=13, leading=18):
    c.setFont(font, size)
    for line in wrap(c, text, font, size, width):
        c.drawString(x, y, line); y -= leading
    return y


def double_frame(c, x, y, w, h, inset1, inset2):
    c.setLineWidth(0.9); c.rect(x + inset1, y + inset1, w - 2 * inset1, h - 2 * inset1)
    c.setLineWidth(0.4); c.rect(x + inset2, y + inset2, w - 2 * inset2, h - 2 * inset2)


def cover(c):
    c.setFillColorRGB(*INK); c.setStrokeColorRGB(*INK)
    double_frame(c, 0, 0, W, H, 12 * mm, 14 * mm)
    c.setFont('Fell', 34); c.drawCentredString(W / 2, H - 45 * mm, 'La seduta storta')
    c.setFont('FellIt', 17); c.drawCentredString(W / 2, H - 55 * mm, 'Le lettere per la seduta')
    x, width = 28 * mm, W - 56 * mm
    y = H - 72 * mm
    steps = [
        'Stampate le due pagine di tessere, anche in bianco e nero, e ritagliatele lungo le linee tratteggiate. '
        'Senza stampante va benissimo scriverle a mano su foglietti o su post-it.',
        'Disponete le lettere in un grande cerchio, largo almeno 60 centimetri, in ordine alfabetico. '
        'Sì e No vanno in alto, i numeri in basso e Addio accanto ai numeri. Se il bicchiere tocca Addio, la seduta si chiude.',
        'Al centro mettete la tessera Inizio con sopra il bicchierino capovolto: parte da lì e ci torna dopo ogni risposta.',
        'Ognuno appoggia un dito sul fondo del bicchiere, leggero. Poi aprite il gioco sul telefono e toccate «Evoca lo Spirito».'
    ]
    for s in steps:
        y = paragraph(c, s, x, y, width) - 7
    # schema del cerchio
    cx, cy, R = W / 2, 72 * mm, 46 * mm
    c.setLineWidth(0.5); c.setStrokeColorRGB(*GREY); c.circle(cx, cy, R + 7 * mm, stroke=1, fill=0)
    c.setStrokeColorRGB(*INK)
    for i, L in enumerate(LETTERS):
        a = math.pi / 2 - (i + 0.5) * (2 * math.pi / len(LETTERS))
        px, py = cx + math.cos(a) * R, cy + math.sin(a) * R
        c.setLineWidth(0.6); c.rect(px - 4 * mm, py - 4 * mm, 8 * mm, 8 * mm)
        c.setFont('Fell', 14); c.drawCentredString(px, py - 1.7 * mm, L)
    c.setFont('Fell', 15)
    c.drawCentredString(cx - 13 * mm, cy + 25 * mm, 'Sì'); c.drawCentredString(cx + 13 * mm, cy + 25 * mm, 'No')
    c.setLineWidth(0.8); c.circle(cx, cy, 10 * mm, stroke=1, fill=0)
    c.setFont('Fell', 11); c.drawCentredString(cx, cy - 1.3 * mm, 'Inizio')
    c.setFont('Times-Roman', 11); c.drawCentredString(cx, cy - 22 * mm, '0  1  2  3  4  5  6  7  8  9')
    c.setFont('Fell', 12); c.drawCentredString(cx, cy - 30 * mm, 'Addio')
    c.setFont('FellIt', 11); c.setFillColorRGB(*GREY)
    c.drawCentredString(W / 2, 17 * mm, 'Uno di voi è lo Spirito. Nessuno sa chi spinge davvero.')
    c.setFillColorRGB(*INK)


def tile(c, x, y, s, label):
    c.setStrokeColorRGB(*INK); c.setFillColorRGB(*INK)
    double_frame(c, x, y, s, s, 3.2 * mm, 4.6 * mm)
    if label == 'Inizio':
        c.setLineWidth(0.8); c.circle(x + s / 2, y + s / 2 + 2.5 * mm, 11 * mm, stroke=1, fill=0)
        c.setFont('Fell', 17); c.drawCentredString(x + s / 2, y + 8 * mm, label)
        return
    font = 'Times-Roman' if label.isdigit() else 'Fell'   # cifre moderne: lo 0 e l'1 d'epoca sembrano lettere
    size = 64 if len(label) == 1 else (36 if len(label) == 2 else 24)
    if label == 'Q':
        size = 54
    shift = -2.5 * mm if label == 'Q' else 0
    c.setFont(font, size)
    asc = pdfmetrics.getAscent(font) / 1000 * size
    c.drawCentredString(x + s / 2 + shift, y + s / 2 - asc * 0.36, label)


def tiles_pages(c):
    s = 45 * mm
    cols, rows = 4, 5
    x0 = (W - cols * s) / 2
    y0 = (H - rows * s) / 2 - 4 * mm
    per = cols * rows
    for pg in range(0, len(TILES), per):
        chunk = TILES[pg:pg + per]
        c.setFillColorRGB(*INK)
        c.setFont('FellIt', 12)
        c.drawCentredString(W / 2, H - 16 * mm, 'La seduta storta: ritagliate lungo le linee tratteggiate')
        for k, label in enumerate(chunk):
            r, col = divmod(k, cols)
            x = x0 + col * s
            y = y0 + (rows - 1 - r) * s
            tile(c, x, y, s, label)
        # linee di taglio
        c.setStrokeColorRGB(*GREY); c.setLineWidth(0.5); c.setDash(3, 3)
        used_rows = math.ceil(len(chunk) / cols)
        for i in range(cols + 1):
            c.line(x0 + i * s, y0 + (rows - used_rows) * s - 4 * mm, x0 + i * s, y0 + rows * s + 4 * mm)
        for j in range(rows - used_rows, rows + 1):
            c.line(x0 - 4 * mm, y0 + j * s, x0 + cols * s + 4 * mm, y0 + j * s)
        c.setDash()
        c.showPage()


def main():
    out = ROOT / 'bicchierino-lettere.pdf'
    c = canvas.Canvas(str(out), pagesize=A4)
    c.setTitle('La seduta storta: le lettere per la seduta')
    c.setAuthor('La seduta storta')
    cover(c); c.showPage()
    tiles_pages(c)
    c.save()
    print('Creato', out.name)


if __name__ == '__main__':
    main()
