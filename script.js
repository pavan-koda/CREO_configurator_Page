// Populated from validation.csv on load; null means CSV not loaded — validation is skipped
let REF_HEADERS     = null;
let validationReady = false;

let allConfigs = [];
let userState  = {};
let page = 1;
const perPage = 10;

// ── Auto-load validation.csv ──────────────────────────────────────────────
// Pointing to the root file as provided in your upload list
const valPath1 = 'config%20files/validation.csv?t=' + Date.now();
const valPath2 = 'validation.csv?t=' + Date.now();

fetch(valPath1)
    .then(r => {
        if (!r.ok) throw new Error('Not found in config files');
        return r.arrayBuffer();
    })
    .catch(() => {
        // Fallback: try root directory if first path fails (404 or network error)
        return fetch(valPath2).then(r => {
            if (!r.ok) throw new Error('Could not find validation.csv in root or config files');
            return r.arrayBuffer();
        });
    })
    .then(buffer => {
        const wb = XLSX.read(buffer, {type: 'array'});
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, {header: 1});
        if (rawRows.length > 0) {
            REF_HEADERS = rawRows[0].map(h => String(h || '').trim()).filter(h => h !== '');
            console.log('Validation headers loaded:', REF_HEADERS);
            validationReady = true;
        }
    })
    .catch(err => { 
        console.error('Validation load failed. Proceeding without strict validation:', err); 
    });

// ── Config Excel upload ───────────────────────────────────────────────────
document.getElementById('excelFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = (evt) => {
        const dataBuffer = evt.target.result;
        const wb = XLSX.read(dataBuffer, {type: 'array'});
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        // 1. Get Raw Data and Headers
        const rawRows = XLSX.utils.sheet_to_json(sheet, {header: 1});
        if (rawRows.length === 0) return;

        const configHeaders = rawRows[0].map(h => String(h || '').trim());
        // Normalize headers: remove spaces and lowercase to avoid "Value 1" vs "Value1" issues
        const normalize = h => String(h).replace(/\s+/g, '').toLowerCase();
        const cleanConfigHeaders = configHeaders.map(normalize);

        // 2. Validation Logic
        const el = document.getElementById('comparisonResult');
        
        // Only validate if template is loaded
        if (REF_HEADERS) {
            // Compare headers regardless of case, order, or spacing
            const refNormalized = REF_HEADERS.map(normalize);

            const missingHeaders = REF_HEADERS.filter(h => 
                !cleanConfigHeaders.includes(normalize(h))
            );

            // Strict check: Find headers in upload that are NOT in validation.csv
            const extraHeaders = configHeaders.filter((h, i) => {
                const norm = cleanConfigHeaders[i];
                return norm !== '' && !refNormalized.includes(norm);
            });

            if (missingHeaders.length > 0 || extraHeaders.length > 0) {
                el.style.display = 'block';
                el.className = 'comparison-result';
                
                let html = '<strong>&#10007; Validation Failed:</strong> Column mismatch.<br>';
                if (missingHeaders.length > 0) {
                    html += `Missing: <div class="header-tags">${missingHeaders.map(h => `<span class="header-tag miss">${h}</span>`).join('')}</div>`;
                }
                if (extraHeaders.length > 0) {
                    html += `Unexpected: <div class="header-tags">${extraHeaders.map(h => `<span class="header-tag miss">${h}</span>`).join('')}</div>`;
                }
                el.innerHTML = html;
                
                // Reset UI
                document.getElementById('excelFile').value = '';
                return;
            }
        }

        // 3. Process Data Rows (Mapping by Header Name, not index)
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        allConfigs = jsonData.filter(row => row.Symbol || row.symbol);

        userState = {}; // Reset state for new upload
        allConfigs.forEach(row => {
            // Normalize key access to handle case sensitivity in column names
            const getVal = (key) => {
                const actualKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                return actualKey ? row[actualKey] : null;
            };

            const symbol = getVal('Symbol');
            const type = String(getVal('type') || '').toLowerCase();

            if (type.includes('multi')) {
                const allVals = Object.keys(row)
                    .filter(k => /^Value\s*\d+$/i.test(k))
                    .sort((a,b) => parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,'')))
                    .map(k => row[k])
                    .filter(v => v && String(v).trim() !== '')
                    .map(v => String(v).trim());
                
                userState[symbol] = [...new Set(allVals)].join(', ');
            } else {
                userState[symbol] = String(getVal('Value1') || '');
            }
        });

        // 4. Success UI Update
        el.style.display = 'none';
        const area = document.getElementById('configUploadArea');
        area.className = 'upload-area done';
        area.innerHTML = `
            <strong style="color:var(--success)">&#10003; File Validated & Loaded</strong>
            <p style="margin:6px 0 0; font-size:13px; color:#555;">
                ${allConfigs.length} symbols found</p>`;

        setTimeout(() => { area.style.display = 'none'; }, 3000);

        document.getElementById('editorView').style.display = 'block';
        page = 1;
        render();
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

// ── Render config rows ────────────────────────────────────────────────────
function render() {
    const container = document.getElementById('configList');
    if (!container) return;
    container.innerHTML = '';
    
    const start = (page - 1) * perPage;
    const pageItems = allConfigs.slice(start, start + perPage);

    pageItems.forEach(row => {
        // Case-insensitive helper
        const getVal = (key) => {
            const actualKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
            return actualKey ? row[actualKey] : '';
        };

        const symbol = getVal('Symbol');
        const question = getVal('Question') || 'Option';
        const type = String(getVal('type') || '').toLowerCase();
        
        const div = document.createElement('div');
        div.className = 'config-row';
        let inputHtml = '';

        if (type.includes('multi')) {
            const available = Object.keys(row)
                .filter(k => /^Value\s*\d+$/i.test(k))
                .sort((a,b) => parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,'')))
                .map(k => row[k])
                .filter(v => v && String(v).trim() !== '')
                .map(v => String(v).trim());

            const selections = (userState[symbol] || '').split(',').map(s => s.trim()).filter(s => s !== '');
            
            inputHtml = `
                <div>
                    <input type="text" id="input-${symbol}" value="${userState[symbol]}" oninput="updateState('${symbol}', this.value)">
                    <div class="tag-container">
                        ${available.map(v => {
                            const active = selections.includes(v);
                            return `<span class="tag ${active ? 'active' : ''}" onclick="toggleTag('${symbol}', '${v}', this)">${v}</span>`;
                        }).join('')}
                    </div>
                </div>`;
        } else if (type === 'drop' || type === 'toggle') {
            const opts = Object.keys(row)
                .filter(k => /^Value\s*\d+$/i.test(k))
                .map(k => row[k])
                .filter(v => v);
            const finalOpts = opts.length > 0 ? opts : ['yes', 'no'];
            
            inputHtml = `<select onchange="updateState('${symbol}', this.value)">
                ${finalOpts.map(o => `<option value="${o}" ${userState[symbol] == o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>`;
        } else {
            inputHtml = `<input type="text" value="${userState[symbol]}" oninput="updateState('${symbol}', this.value)">`;
        }

        div.innerHTML = `
            <div class="info-cell">
                <strong>${question}</strong>
                <small>Symbol: ${symbol}</small>
            </div>
            <div>${inputHtml}</div>
        `;
        container.appendChild(div);
    });

    // Pagination update
    const totalPages = Math.ceil(allConfigs.length / perPage);
    document.getElementById('pageTracker').innerText = `Page ${page} of ${totalPages || 1}`;
    document.getElementById('prevBtn').disabled = page === 1;
    document.getElementById('nextBtn').disabled = page >= totalPages;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function toggleTag(symbol, value, element) {
    const currentVal = userState[symbol] || '';
    const selectionSet = new Set(currentVal.split(',').map(p => p.trim()).filter(p => p !== ''));
    
    if (selectionSet.has(value)) {
        selectionSet.delete(value);
        element.classList.remove('active');
    } else {
        selectionSet.add(value);
        element.classList.add('active');
    }
    
    const newValue = Array.from(selectionSet).join(', ');
    userState[symbol] = newValue;
    const input = document.getElementById(`input-${symbol}`);
    if (input) input.value = newValue;
}

function updateState(key, val) { userState[key] = val; }

function changePage(step) { 
    page += step; 
    render(); 
    window.scrollTo(0, 0); 
}

function exportConfig() {
    let content = "! Generated config.pro\n";

    // Iterate allConfigs to ensure all pages are included and original order is preserved
    allConfigs.forEach(row => {
        const symKey = Object.keys(row).find(k => k.toLowerCase() === 'symbol');
        const symbol = symKey ? row[symKey] : null;
        const val = symbol ? userState[symbol] : null;

        if (symbol && val && String(val).trim() !== '') {
            content += `${symbol} ${val}\n`;
        }
    });
    const blob = new Blob([content], {type: 'text/plain'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'config.pro';
    link.click();
}