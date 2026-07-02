let allConfigs = [];
let userState  = {};
let page = 1;
const perPage = 10;
// ── Config Excel upload ───────────────────────────────────────────────────
document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const processData = (configRows) => {
        if (!configRows || configRows.length === 0) return;

    const el = document.getElementById('comparisonResult');

        // ── Build data ──
        const headers  = configRows[0];
        const jsonData = configRows.slice(1).map(row => {
            let obj = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
        });

        allConfigs = jsonData.filter(row => {
            const symKey = Object.keys(row).find(k => k.toLowerCase() === 'symbol');
            return symKey && row[symKey];
        });

        userState = {};
        allConfigs.forEach(row => {
            const getVal = key => {
                const k = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                return k ? row[k] : null;
            };
            const symbol = getVal('Symbol');
            const type   = String(getVal('type') || '').toLowerCase();

            if (type.includes('multi')) {
                const allVals = Object.keys(row)
                    .filter(k => /^Value\s*\d+$/i.test(k))
                    .sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
                    .map(k => row[k])
                    .filter(v => v && String(v).trim() !== '')
                    .map(v => String(v).trim());
                userState[symbol] = [...new Set(allVals)].join(', ');
            } else {
                userState[symbol] = String(getVal('Value1') || '');
            }
        });

        // ── Success UI ──
        el.style.display = 'none';
        const area = document.getElementById('configUploadArea');
        area.className = 'upload-area done';
        area.innerHTML = `
            <strong style="color:var(--success)">&#10003; File Validated & Loaded</strong>
            <p style="margin:6px 0 0; font-size:13px; color:#555;">${allConfigs.length} symbols found</p>`;
        setTimeout(() => { area.style.display = 'none'; }, 3000);

        document.getElementById('excelFile').value = '';
        document.getElementById('editorView').style.display = 'block';
        page = 1;
        render();
    };

    readXlsxFile(file).then(configRows => processData(configRows));
});

// ── Render config rows ────────────────────────────────────────────────────
function render() {
    const container = document.getElementById('configList');
    if (!container) return;
    container.innerHTML = '';

    const start     = (page - 1) * perPage;
    const pageItems = allConfigs.slice(start, start + perPage);

    pageItems.forEach(row => {
        const getVal = key => {
            const k = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
            return k ? row[k] : '';
        };

        const symbol   = getVal('Symbol');
        const question = getVal('Question') || 'Option';
        const type     = String(getVal('type') || '').toLowerCase();

        const div = document.createElement('div');
        div.className = 'config-row';
        let inputHtml = '';

        if (type.includes('multi')) {
            const available = Object.keys(row)
                .filter(k => /^Value\s*\d+$/i.test(k))
                .sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
                .map(k => row[k])
                .filter(v => v && String(v).trim() !== '')
                .map(v => String(v).trim());
            const selections = (userState[symbol] || '').split(',').map(s => s.trim()).filter(s => s);
            inputHtml = `
                <div>
                    <input type="text" id="input-${symbol}" value="${userState[symbol]}" oninput="updateState('${symbol}', this.value)">
                    <div class="tag-container">
                        ${available.map(v => `<span class="tag ${selections.includes(v) ? 'active' : ''}" onclick="toggleTag('${symbol}', '${v}', this)">${v}</span>`).join('')}
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
            <div>${inputHtml}</div>`;
        container.appendChild(div);
    });

    const totalPages = Math.ceil(allConfigs.length / perPage);
    document.getElementById('pageTracker').innerText = `Page ${page} of ${totalPages || 1}`;
    document.getElementById('prevBtn').disabled = page === 1;
    document.getElementById('nextBtn').disabled = page >= totalPages;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function toggleTag(symbol, value, element) {
    const selectionSet = new Set((userState[symbol] || '').split(',').map(p => p.trim()).filter(p => p));
    if (selectionSet.has(value)) { selectionSet.delete(value); element.classList.remove('active'); }
    else                         { selectionSet.add(value);    element.classList.add('active'); }
    const newValue = Array.from(selectionSet).join(', ');
    userState[symbol] = newValue;
    const input = document.getElementById(`input-${symbol}`);
    if (input) input.value = newValue;
}

function updateState(key, val) { userState[key] = val; }

function changePage(step) { page += step; render(); window.scrollTo(0, 0); }

function exportConfig() {
    let content = "! Generated config.pro\n";
    allConfigs.forEach(row => {
        const symKey = Object.keys(row).find(k => k.toLowerCase() === 'symbol');
        const symbol = symKey ? row[symKey] : null;
        const val    = symbol ? userState[symbol] : null;
        if (symbol && val != null && String(val).trim() !== '') content += `${symbol} ${val}\n`;
    });
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'config.pro';
    link.click();
}
