(function(){
  if (window.__darkModeLoaderInstalled) return; window.__darkModeLoaderInstalled = true;
  try{
    const css = `
:root{
  --dm-bg:#0e1113;
  --dm-surface:#131516;
  --dm-text:#ffffff;
  --dm-accent:#ffffff;
  --dm-border:rgba(255,255,255,0.06);
}
html[data-theme="dark"], html[data-theme="dark"] body {
  background:var(--dm-bg) !important;
  color:var(--dm-text) !important;
}
html[data-theme="dark"] *, html[data-theme="dark"] *::before, html[data-theme="dark"] *::after {
  color:var(--dm-text) !important;
  border-color:var(--dm-border) !important;
}
html[data-theme="dark"] a, html[data-theme="dark"] a:visited {
  color:var(--dm-text) !important;
  opacity:0.95;
}
/* Surfaces */
html[data-theme="dark"] header, html[data-theme="dark"] .topbar, html[data-theme="dark"] .text-box, html[data-theme="dark"] .map-gallery-frame, html[data-theme="dark"] .map-gallery, html[data-theme="dark"] .area-bar {
  background-color:var(--dm-surface) !important;
  color:var(--dm-text) !important;
  border-color:var(--dm-border) !important;
}
html[data-theme="dark"] body:not(.map-page-body) header,
html[data-theme="dark"] body:not(.map-page-body) .area-bar {
  background-color: transparent !important;
  color: var(--dm-text) !important;
  border-color: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
html[data-theme="dark"] .area-bar {
  padding:12px !important;
  border:1px solid var(--dm-border) !important;
  border-radius:14px !important;
  backdrop-filter: blur(14px) saturate(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
}
html[data-theme="dark"] body:not(.map-page-body) .area-bar {
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
}
/* Controls */
html[data-theme="dark"] button, html[data-theme="dark"] input, html[data-theme="dark"] .enter-site-link {
  color:var(--dm-text) !important;
  background:transparent !important;
  border-color:var(--dm-border) !important;
}
/* Images */
html[data-theme="dark"] img { filter:brightness(1.02) !important; opacity:0.99 !important; }
.site-dark-toggle{position:fixed;right:12px;bottom:12px;width:44px;height:44px;border-radius:8px;background:var(--dm-surface);border:1px solid var(--dm-border);display:grid;place-items:center;z-index:1200;color:var(--dm-text);cursor:pointer;padding:0;line-height:0}
.site-dark-toggle svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.site-dark-toggle .toggle-icon{grid-area:1 / 1;display:grid;place-items:center;opacity:0;transform:scale(0.92);transition:opacity 0.15s ease, transform 0.15s ease}
html[data-theme="dark"] .site-dark-toggle .toggle-icon.sun,
html:not([data-theme="dark"]) .site-dark-toggle .toggle-icon.moon{opacity:1;transform:scale(1)}
.site-dark-toggle:focus{outline:2px solid rgba(255,255,255,0.12)}
    `;
    const style = document.createElement('style'); style.setAttribute('data-dark-mode','1'); style.appendChild(document.createTextNode(css)); document.head.appendChild(style);
  }catch(e){console.warn('dark-mode-loader: CSS injection failed',e)}

  // Initialize theme: default to dark unless user explicitly chose light
  try{
    const stored = localStorage.getItem('site-theme');
    if (stored === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme','dark');
      if (stored !== 'dark') localStorage.setItem('site-theme','dark');
    }
  }catch(e){}

  // Provide toggle function
  window.toggleSiteTheme = function(t){ try{ if(t==='dark'){document.documentElement.setAttribute('data-theme','dark'); localStorage.setItem('site-theme','dark')} else {document.documentElement.removeAttribute('data-theme'); localStorage.setItem('site-theme','light')}}catch(e){} };

  // Add floating toggle if none exists
  if (!document.getElementById('site-dark-toggle')){
    const btn = document.createElement('button');
    btn.id = 'site-dark-toggle'; btn.className = 'site-dark-toggle'; btn.setAttribute('aria-label','Toggle dark mode'); btn.type = 'button';
    btn.innerHTML = '<span class="toggle-icon sun" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.93 19.07l1.41-1.41"></path><path d="M17.66 6.34l1.41-1.41"></path></svg></span><span class="toggle-icon moon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path></svg></span>';
    btn.addEventListener('click', ()=>{ if(document.documentElement.getAttribute('data-theme')==='dark'){window.toggleSiteTheme('light')} else {window.toggleSiteTheme('dark')} });
    btn.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') btn.click(); });
    (document.body || document.documentElement).appendChild(btn);
  }
})();
