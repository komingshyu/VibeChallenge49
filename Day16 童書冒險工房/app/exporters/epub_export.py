
from ebooklib import epub
import os

def export_epub(spreads, title, author, out_path):
    book = epub.EpubBook()
    book.set_identifier("storybook-001"); book.set_title(title); book.set_language('zh'); book.add_author(author)
    chapters = []
    for sp in spreads:
        html = f"""<h2>第 {sp.get('page')} 頁</h2>
        <p>{sp.get('display_text','')}</p>
        {f'<img src="{os.path.basename(sp.get("image_path"))}" />' if sp.get('image_path') else ''}
        """
        ch = epub.EpubHtml(title=f"Page {sp.get('page')}", file_name=f"p{sp.get('page')}.xhtml", lang='zh')
        ch.content = html; chapters.append(ch); book.add_item(ch)
        if sp.get('image_path'):
            with open(sp.get('image_path'), 'rb') as f:
                img_item = epub.EpubItem(uid=f"img{sp.get('page')}", file_name=os.path.basename(sp.get('image_path')), media_type='image/png', content=f.read())
                book.add_item(img_item)
    book.toc = chapters; book.add_item(epub.EpubNcx()); book.add_item(epub.EpubNav())
    nav_css = epub.EpubItem(uid="style_nav", file_name="style/nav.css", media_type="text/css", content='BODY { font-family: Arial; }')
    book.add_item(nav_css); book.spine = ['nav'] + chapters
    os.makedirs(os.path.dirname(out_path), exist_ok=True); epub.write_epub(out_path, book, {}); return out_path
