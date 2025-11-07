(function(){
        'use strict';
        var PAGE_SIZE = 10;
        var startIndex = 1; // Blogger Atom start-index (1-based)
        var loading = false;
        var postsCache = [];

        function qs(sel){ return document.querySelector(sel); }
        function escHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        function showSkeleton(count){
          var grid = qs('#grid');
          grid.innerHTML = '';
          for(var i=0;i<count;i++){
            var sk = document.createElement('div'); sk.className = 'skeleton-card';
            var st = document.createElement('div'); st.className = 'skeleton-thumb';
            var tt = document.createElement('div'); tt.className = 'skeleton-title';
            sk.appendChild(st); sk.appendChild(tt);
            grid.appendChild(sk);
          }
        }

        // IntersectionObserver for lazy-loading images
        var io = null;
        function setupObserver(){
          if('IntersectionObserver' in window){
            io = new IntersectionObserver(function(entries){
              entries.forEach(function(ent){
                if(ent.isIntersecting){
                  var img = ent.target;
                  var src = img.getAttribute('data-src');
                  if(src){
                    img.src = src;
                    img.onload = function(){ img.classList.add('loaded'); };
                    img.removeAttribute('data-src');
                  }
                  io.unobserve(img);
                }
              });
            }, { rootMargin: '200px' });
          } else {
            io = null;
          }
        }
        function observeImage(img){
          if(!img) return;
          if(io) io.observe(img); else { var s = img.getAttribute('data-src'); if(s){ img.src = s; img.classList.add('loaded'); img.removeAttribute('data-src'); } }
        }

        // Build blog feed base (Atom)
        function blogBase(){
          return location.origin + location.pathname.replace(/\/[^\/]*$/,'/') + 'feeds/posts/default?alt=atom';
        }

        // Safe XML parse
        function parseAtom(xmlText){
          try{
            var parser = new DOMParser();
            var doc = parser.parseFromString(xmlText, 'application/xml');
            var err = doc.getElementsByTagName('parsererror');
            if(err.length){ console.error('XML parse error', err[0] && err[0].textContent ? err[0].textContent : err); return null; }
            return doc;
          }catch(e){ console.error('parseAtom error', e); return null; }
        }

        // Extract thumbnail: media:thumbnail, enclosure, or first img in content
        function extractThumbnail(entry){
          var mediaThumb = entry.getElementsByTagName('media:thumbnail')[0];
          if(mediaThumb && mediaThumb.getAttribute('url')) return mediaThumb.getAttribute('url');
          var links = entry.getElementsByTagName('link');
          for(var i=0;i<links.length;i++){
            var rel = links[i].getAttribute('rel');
            if(rel === 'enclosure' && links[i].getAttribute('href')) return links[i].getAttribute('href');
          }
          var contentNode = entry.getElementsByTagName('content')[0] || entry.getElementsByTagName('summary')[0];
          var html = '';
          if(contentNode){ html = contentNode.textContent || ''; }
          var m = html.match(/&lt;img[^&gt;]+src=(?:'|")?([^"'&gt;\\s]+)/i);
          if(m) return m[1];
          // placeholder (SVG escaped)
          var svg = '&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 4 3&quot;&gt;&lt;rect width=&quot;4&quot; height=&quot;3&quot; fill=&quot;#222&quot;/&gt;&lt;/svg&gt;';
          return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        }

        // Convert Atom entry to JS object
        function atomToPost(entry){
          try{
            var idNode = entry.getElementsByTagName('id')[0];
            var titleNode = entry.getElementsByTagName('title')[0];
            var contentNode = entry.getElementsByTagName('content')[0] || entry.getElementsByTagName('summary')[0];
            var publishedNode = entry.getElementsByTagName('published')[0] || entry.getElementsByTagName('updated')[0];
            var links = entry.getElementsByTagName('link');
            var linkHref = '';
            for(var i=0;i<links.length;i++){
              if(links[i].getAttribute('rel') === 'alternate' && links[i].getAttribute('href')){ linkHref = links[i].getAttribute('href'); break; }
            }
            var labels = [];
            var cats = entry.getElementsByTagName('category');
            for(var j=0;j<cats.length;j++){ var term = cats[j].getAttribute('term'); if(term) labels.push(term); }
            var contentHtml = contentNode ? (contentNode.textContent || '') : '';
            return {
              id: idNode ? (idNode.textContent || '') : (linkHref || (titleNode ? (titleNode.textContent || '') : '')),
              title: titleNode ? (titleNode.textContent || '(no title)') : '(no title)',
              contentHtml: contentHtml,
              url: linkHref,
              published: publishedNode ? (publishedNode.textContent || '') : '',
              labels: labels,
              thumbnail: extractThumbnail(entry)
            };
          }catch(e){ console.error('atomToPost', e); return null; }
        }

        // Render a card
        function renderCard(post){
          var article = document.createElement('article'); article.className='card'; article.tabIndex=0;
          var thumbWrap = document.createElement('div'); thumbWrap.className='thumb';
          var img = document.createElement('img'); img.setAttribute('alt', escHtml(post.title)); img.setAttribute('data-src', post.thumbnail);
          thumbWrap.appendChild(img);
          var titleEl = document.createElement('div'); titleEl.className='title'; titleEl.innerHTML = escHtml(post.title);
          article.appendChild(thumbWrap); article.appendChild(titleEl);
          article.addEventListener('click', function(){ openModal(post); });
          article.addEventListener('keydown', function(e){ if(e.key === 'Enter') openModal(post); });
          qs('#grid').appendChild(article);
          observeImage(img);
        }

        // Remove <img> tags from HTML content for modal
        function removeImageTagsFromHtml(html){
          var container = document.createElement('div');
          container.innerHTML = html || '';
          var imgs = container.querySelectorAll('img');
          imgs.forEach(function(i){ i.remove(); });
          var figs = container.querySelectorAll('figure'); figs.forEach(function(f){ var imgInside = f.querySelectorAll('img'); imgInside.forEach(function(ii){ ii.remove(); }); });
          var withSrcset = container.querySelectorAll('[srcset]'); withSrcset.forEach(function(el){ el.removeAttribute('srcset'); });
          return container.innerHTML;
        }

        // Fetch Atom feed with start-index & max-results
        function fetchAtom(start, maxResults, cb){
          loading = true;
          var loadBtn = qs('#loadMore');
          if(loadBtn){ loadBtn.disabled = true; loadBtn.textContent = 'Loading...'; }
          var url = blogBase() + '&amp;start-index=' + encodeURIComponent(start) + '&amp;max-results=' + encodeURIComponent(maxResults);
          url = url.replace(/&amp;/g,'&'); // actual fetch must use &
          fetch(url).then(function(res){ if(!res.ok) throw new Error('Network ' + res.status); return res.text(); }).then(function(txt){
            var doc = parseAtom(txt);
            if(!doc){ loading = false; if(loadBtn){ loadBtn.disabled = false; loadBtn.textContent = 'Load more'; } cb([]); return; }
            var entries = doc.getElementsByTagName('entry');
            var out = [];
            for(var i=0;i<entries.length;i++){ var p = atomToPost(entries[i]); if(p) out.push(p); }
            loading = false;
            if(loadBtn){ loadBtn.disabled = false; loadBtn.textContent = 'Load more'; }
            cb(out);
          }).catch(function(err){ console.error('fetchAtom', err); loading = false; if(loadBtn){ loadBtn.disabled = false; loadBtn.textContent = 'Load more'; } cb([]); });
        }

        // Load next page
        function loadNext(){
          if(loading) return;
          showSkeleton(PAGE_SIZE);
          setTimeout(function(){
            fetchAtom(startIndex, PAGE_SIZE, function(list){
              if(!list || list.length === 0){
                qs('#noMore').style.display = 'block';
                qs('#loadMore').style.display = 'none';
                if(postsCache.length === 0) qs('#grid').innerHTML = '<div class="no-results">No posts found.</div>';
                return;
              }
              var grid = qs('#grid');
              if(postsCache.length === 0) grid.innerHTML = '';
              list.forEach(function(p){ postsCache.push(p); renderCard(p); });
              startIndex += PAGE_SIZE;
              if(list.length < PAGE_SIZE){ qs('#noMore').style.display = 'block'; qs('#loadMore').style.display = 'none'; }
            });
          }, 150);
        }

        // Open & close modal
        function openModal(post){
          var modal = qs('#modal'); modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
          qs('#modalTitle').textContent = post.title || '';
          qs('#modalContent').innerHTML = removeImageTagsFromHtml(post.contentHtml) || escHtml(post.title || '');
          buildRecommendations(post);
          qs('#modalClose').focus();
        }
        function closeModal(){ var modal = qs('#modal'); modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); qs('#modalContent').innerHTML=''; qs('#recsList').innerHTML=''; }

        // Recommendations: local cache + fallback fetch label feed
        function buildRecommendations(post){
          var found = [];
          if(post.labels && post.labels.length){
            postsCache.forEach(function(p){
              if(p.id === post.id) return;
              for(var i=0;i<p.labels.length;i++){ if(post.labels.indexOf(p.labels[i]) !== -1){ found.push(p); break; } }
            });
          }
          if(found.length >= 6){ renderRecs(found.slice(0,6)); return; }
          if(post.labels && post.labels.length){
            fetchLabelAtom(post.labels[0], 6, function(remote){
              remote.forEach(function(r){ if(r.id !== post.id && !found.some(function(f){ return f.id === r.id; })) found.push(r); });
              renderRecs(found.slice(0,6));
            });
          } else { renderRecs([]); }
        }

        function renderRecs(list){
          var rl = qs('#recsList'); rl.innerHTML = '';
          if(!list || list.length === 0){ rl.innerHTML = '<div style="color:var(--muted);font-size:13px">No recommendations</div>'; return; }
          list.slice(0,6).forEach(function(p){
            var item = document.createElement('div'); item.className = 'rec-item';
            var t = document.createElement('div'); t.className = 'rec-thumb';
            var im = document.createElement('img'); im.src = p.thumbnail; im.alt = escHtml(p.title);
            t.appendChild(im);
            var meta = document.createElement('div'); meta.className = 'rec-meta';
            meta.innerHTML = '<div style="font-weight:600">' + escHtml(p.title) + '</div><div style="color:var(--muted);font-size:12px">' + (p.published ? p.published.split('T')[0] : '') + '</div>';
            item.appendChild(t); item.appendChild(meta);
            item.addEventListener('click', function(){ openModal(p); });
            rl.appendChild(item);
          });
        }

        // Fetch label-specific Atom feed
        function fetchLabelAtom(label, limit, cb){
          var base = location.origin + location.pathname.replace(/\/[^\/]*$/,'/');
          var url = base + 'feeds/posts/default/-/' + encodeURIComponent(label) + '?alt=atom&amp;max-results=' + encodeURIComponent(limit);
          url = url.replace(/&amp;/g,'&');
          fetch(url).then(function(res){ return res.text(); }).then(function(txt){
            var doc = parseAtom(txt); if(!doc){ cb([]); return; }
            var entries = doc.getElementsByTagName('entry'); var out = [];
            for(var i=0;i<entries.length;i++){ var p = atomToPost(entries[i]); if(p) out.push(p); }
            cb(out);
          }).catch(function(e){ console.error('fetchLabelAtom', e); cb([]); });
        }

        // Instant live suggestions
        var suggestTimer = null;
        function showSuggestions(q){
          var wrap = qs('.search-wrap');
          var box = qs('#suggestionsBox');
          if(!box){ box = document.createElement('div'); box.id = 'suggestionsBox'; box.className = 'suggestions'; wrap.appendChild(box); }
          if(!q){ box.style.display = 'none'; box.innerHTML = ''; return; }
          box.style.display = ''; box.innerHTML = '<div class="s-item" style="color:var(--muted)">Searching...</div>';
          var base = location.origin + location.pathname.replace(/\/[^\/]*$/,'/');
          var url = base + 'feeds/posts/default?alt=atom&amp;q=' + encodeURIComponent(q) + '&amp;max-results=8';
          url = url.replace(/&amp;/g,'&');
          fetch(url).then(function(res){ return res.text(); }).then(function(txt){
            var doc = parseAtom(txt); if(!doc){ box.innerHTML = '<div class="s-item" style="color:var(--muted)">Error</div>'; return; }
            var entries = doc.getElementsByTagName('entry');
            if(!entries || entries.length === 0){ box.innerHTML = '<div class="s-item" style="color:var(--muted)">No suggestions</div>'; return; }
            box.innerHTML = '';
            for(var i=0;i<entries.length;i++){
              var p = atomToPost(entries[i]); if(!p) continue;
              var el = document.createElement('div'); el.className = 's-item'; el.textContent = p.title;
              (function(post){ el.addEventListener('click', function(){ box.style.display = 'none'; openModal(post); }); })(p);
              box.appendChild(el);
            }
          }).catch(function(e){ console.error('suggestions', e); box.innerHTML = '<div class="s-item" style="color:var(--muted)">Error</div>'; });
        }

        // Run full search on Enter (max 50)
        function runSearch(q){
          if(!q) return;
          qs('#grid').innerHTML = '';
          postsCache = [];
          qs('#noMore').style.display = 'none';
          qs('#loadMore').style.display = 'none';
          showSkeleton(6);
          var base = location.origin + location.pathname.replace(/\/[^\/]*$/,'/');
          var url = base + 'feeds/posts/default?alt=atom&amp;q=' + encodeURIComponent(q) + '&amp;max-results=50';
          url = url.replace(/&amp;/g,'&');
          fetch(url).then(function(res){ return res.text(); }).then(function(txt){
            var doc = parseAtom(txt);
            if(!doc){ qs('#grid').innerHTML = '<div class="no-results">Search failed</div>'; return; }
            var entries = doc.getElementsByTagName('entry');
            if(!entries || entries.length === 0){ qs('#grid').innerHTML = '<div class="no-results">No results</div>'; return; }
            qs('#grid').innerHTML = '';
            for(var i=0;i<entries.length;i++){ var p = atomToPost(entries[i]); if(p){ postsCache.push(p); renderCard(p); } }
          }).catch(function(e){ console.error('runSearch', e); qs('#grid').innerHTML = '<div class="no-results">Search error</div>'; });
        }

        // Init
        document.addEventListener('DOMContentLoaded', function(){
          setupObserver();
          var loadBtn = qs('#loadMore'); if(loadBtn) loadBtn.addEventListener('click', loadNext);
          var modalClose = qs('#modalClose'); if(modalClose) modalClose.addEventListener('click', closeModal);
          var modalElem = qs('#modal'); if(modalElem) modalElem.addEventListener('click', function(e){ if(e.target === modalElem) closeModal(); });
          document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && qs('#modal') && qs('#modal').classList.contains('open')) closeModal(); });

          var sinput = qs('#searchInput');
          sinput.addEventListener('input', function(){
            var q = this.value.trim();
            clearTimeout(suggestTimer);
            suggestTimer = setTimeout(function(){ showSuggestions(q); }, 220);
          });
          sinput.addEventListener('keydown', function(e){
            if(e.key === 'Enter'){ e.preventDefault(); var q = this.value.trim(); runSearch(q); qs('#suggestionsBox') && (qs('#suggestionsBox').style.display='none'); }
            if(e.key === 'Escape'){ qs('#suggestionsBox') && (qs('#suggestionsBox').style.display='none'); }
          });
          document.addEventListener('click', function(e){ if(!e.target.closest('.search-wrap')){ qs('#suggestionsBox') && (qs('#suggestionsBox').style.display='none'); } });

          showSkeleton(PAGE_SIZE);
          setTimeout(function(){ loadNext(); }, 120);
        });

        // expose debugging helpers
        window._blogAtomTheme = { fetchAtom: fetchAtom, parseAtom: parseAtom };

      })();




write this full javascript avoid saxparse exception and do not use &<> or any special entities instead use &amp; etc fully formated