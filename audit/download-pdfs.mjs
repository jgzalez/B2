import fs from 'node:fs/promises';
import path from 'node:path';

const targets = {
  'ley-47-25.pdf': 'https://www.dgcp.gob.do/new_dgcp/documentos/politicas_normas_y_procedimientos/leyes_y_decretos/Ley%2047-25.pdf',
  'revista-contrataciones-2025.pdf': 'https://www.dgcp.gob.do/wp-content/uploads/publicaciones/Revista-contrataciones-septiembre-2025.pdf',
  'estudio-mujeres-mipymes.pdf': 'https://www.dgcp.gob.do/transparencia/documentos/publicaciones_oficiales/Estudio-Empoderamiento-economico-de-las-mujeres-que-lideran-mipymes-mediante-la-contratacion-publica.pdf',
  'formulario-rpe.pdf': 'https://www.dgcp.gob.do/wp-content/uploads/servicios/Formulario-de-solicitud-de-inscripcion-actualizacion-en-el-Registro-de-Proveedores-del-Estado-RPE.pdf',
};
const out = path.resolve('evidence/pdfs');
await fs.mkdir(out, { recursive: true });
for (const [name, url] of Object.entries(targets)) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'DGCP-NORTIC-B2-Audit/1.0' } });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(path.join(out, name), data);
  console.log(`${name}\t${data.length}\t${response.headers.get('content-type')}\t${url}`);
}
