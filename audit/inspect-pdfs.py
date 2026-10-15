import json
from pathlib import Path
from pypdf import PdfReader

out = []
for pdf in sorted(Path('evidence/pdfs').glob('*.pdf')):
    reader = PdfReader(pdf)
    root = reader.trailer['/Root']
    mark = root.get('/MarkInfo') or {}
    text_lengths = []
    extraction_errors = []
    for index, page in enumerate(reader.pages):
        try:
            text_lengths.append(len((page.extract_text() or '').strip()))
        except Exception as exc:
            text_lengths.append(0)
            extraction_errors.append({'page': index + 1, 'error': str(exc)})
    fields = reader.get_fields() or {}
    out.append({
        'file': pdf.name,
        'bytes': pdf.stat().st_size,
        'pages': len(reader.pages),
        'tagged_marked': bool(mark.get('/Marked')),
        'has_struct_tree_root': '/StructTreeRoot' in root,
        'document_language': root.get('/Lang'),
        'viewer_display_doc_title': bool((root.get('/ViewerPreferences') or {}).get('/DisplayDocTitle')),
        'metadata': {str(k): str(v) for k, v in (reader.metadata or {}).items()},
        'form_field_count': len(fields),
        'form_fields': [{'name': str(name), 'type': str((value or {}).get('/FT')), 'alt_name': str((value or {}).get('/TU')) if (value or {}).get('/TU') else None} for name, value in list(fields.items())[:100]],
        'pages_with_no_extractable_text': sum(1 for n in text_lengths if n == 0),
        'min_page_text_chars': min(text_lengths) if text_lengths else 0,
        'median_page_text_chars': sorted(text_lengths)[len(text_lengths)//2] if text_lengths else 0,
        'total_text_chars': sum(text_lengths),
        'extraction_errors': extraction_errors,
    })

Path('evidence/pdfs/inspection.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(out, ensure_ascii=False, indent=2))
