import { state } from '../config/state.js';
import { i18n } from '../config/i18n.js';
import { formatRet } from '../utils/formatter.js';

export function closeModal(event) {
    if (event && event.target !== document.getElementById('analysisModal') && event.currentTarget !== event.target) return;
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    
    modal.classList.remove('show');
    document.body.style.overflow = '';
    
    setTimeout(() => {
        content.innerHTML = '';
    }, 300);
}

export function navigateToAnalysis(code) {
    const modal = document.getElementById('analysisModal');
    const content = document.getElementById('analysisContent');
    const loader = document.getElementById('modalLoader');
    
    // Reset state
    content.style.display = 'none';
    content.style.opacity = '0';
    content.innerHTML = '';
    loader.classList.remove('hidden');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Fetch native data
    const script = document.createElement('script');
    script.src = `/api/fundgz?code=${code}&t=1&rt=${Date.now()}`;
    
    // Generate native UI on load
    script.onload = () => {
        if (typeof window.fundinfo_yjpj !== 'undefined') {
            const data = window.fundinfo_yjpj;
            const jdsy = data.jdsy && data.jdsy[0] ? data.jdsy[0].split(',') : [];
            const lsndsy = data.lsndsy && data.lsndsy[0] ? data.lsndsy[0] : {};
            const dtsy = data.dtsy && data.dtsy[0] ? data.dtsy[0].split(',') : [];
            const jjpj = data.jjpj && data.jjpj[0] ? data.jjpj[0].split(',') : [];

            const [
                fundCode = code, name = '-', estDate = '-', 
                ytd = '-', w1 = '-', m1 = '-', m3 = '-', m6 = '-', y1 = '-', 
                y2 = '-', y3 = '-', y5 = '-', inc = '-'
            ] = jdsy;

            const curYear = new Date().getFullYear();
            const dict = i18n[state.currentLang];
            const stars = jjpj.find(r => r.trim() !== '') || '无评级';

            content.innerHTML = `
                <div class="analysis-header">
                    <div class="analysis-title">
                        <h4>
                            <span class="code-badge">${fundCode}</span> 
                            ${name}
                        </h4>
                        <span class="est-date">${dict.anaEst}: ${estDate}</span>
                    </div>
                    <div class="analysis-rating" title="晨星评级">${stars}</div>
                </div>
                
                <div class="analysis-grid">
                    <div class="analysis-card">
                        <h5>${dict.anaShortTerm}</h5>
                        <ul class="data-list">
                            <li class="data-item"><span>${dict.period1w}</span>${formatRet(w1)}</li>
                            <li class="data-item"><span>${dict.period1m}</span>${formatRet(m1)}</li>
                            <li class="data-item"><span>${dict.period3m}</span>${formatRet(m3)}</li>
                            <li class="data-item"><span>${dict.period6m}</span>${formatRet(m6)}</li>
                            <li class="data-item"><span>${dict.periodYtd}</span>${formatRet(ytd)}</li>
                            <li class="data-item"><span>${dict.period1y}</span>${formatRet(y1)}</li>
                        </ul>
                    </div>
                    
                    <div class="analysis-card">
                        <h5>${dict.anaLongTerm}</h5>
                        <ul class="data-list">
                            <li class="data-item"><span>${dict.period2y}</span>${formatRet(y2)}</li>
                            <li class="data-item"><span>${dict.period3y}</span>${formatRet(y3)}</li>
                            <li class="data-item"><span>${dict.period5y}</span>${formatRet(y5)}</li>
                            <li class="data-item"><span>${dict.periodInc}</span>${formatRet(inc)}</li>
                        </ul>
                    </div>
                    
                    <div class="analysis-card">
                        <h5>${dict.anaAnnual}</h5>
                        <ul class="data-list">
                            <li class="data-item"><span>${curYear - 1}</span>${formatRet(lsndsy[(curYear - 1).toString()])}</li>
                            <li class="data-item"><span>${curYear - 2}</span>${formatRet(lsndsy[(curYear - 2).toString()])}</li>
                            <li class="data-item"><span>${curYear - 3}</span>${formatRet(lsndsy[(curYear - 3).toString()])}</li>
                            <li class="data-item"><span>${curYear - 4}</span>${formatRet(lsndsy[(curYear - 4).toString()])}</li>
                        </ul>
                    </div>

                    <div class="analysis-card">
                        <h5>${dict.anaFI}</h5>
                        <ul class="data-list">
                            <li class="data-item"><span>${dict.period1y}</span>${formatRet(dtsy[0])}</li>
                            <li class="data-item"><span>${dict.period2y}</span>${formatRet(dtsy[1])}</li>
                            <li class="data-item"><span>${dict.period3y}</span>${formatRet(dtsy[2])}</li>
                        </ul>
                    </div>
                </div>
            `;
            
            // Show content, hide loader
            loader.classList.add('hidden');
            content.style.display = 'block';
            // Trigger reflow to animate opacity
            void content.offsetWidth;
            content.style.opacity = '1';
        } else {
            loader.classList.add('hidden');
            content.style.display = 'block';
            content.style.opacity = '1';
            content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (No Data)</div>`;
        }
        delete window.fundinfo_yjpj;
        script.remove();
    };
    
    script.onerror = () => {
        loader.classList.add('hidden');
        content.style.display = 'block';
        content.style.opacity = '1';
        content.innerHTML = `<div class="error-message modal-error">${i18n[state.currentLang].fetchError} (Network Error)</div>`;
        script.remove();
    };
    document.head.appendChild(script);
}

export function initModalListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('analysisModal');
            if (modal.classList.contains('show')) {
                closeModal();
            }
        }
    });
}
