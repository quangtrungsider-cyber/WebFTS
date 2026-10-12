import os
import re

modal_path = os.path.join(os.getcwd(), 'frontend', 'src', 'ui', 'modals', 'BoundariesModal.ts')

with open(modal_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add showSelectedOnly to class properties
content = content.replace(
    'private checkedIds: Set<string> = new Set();',
    'private checkedIds: Set<string> = new Set();\n    private showSelectedOnly: boolean = false;'
)

# 2. Update btnShowSelected click handler
old_btn_click = """        let showSelectedOnly = false;
        btnShowSelected.onclick = () => {
            showSelectedOnly = !showSelectedOnly;
            btnShowSelected.style.background = showSelectedOnly ? 'rgba(167, 139, 250, 0.3)' : '';
            this.renderList(showSelectedOnly);
        };"""

new_btn_click = """        btnShowSelected.onclick = () => {
            this.showSelectedOnly = !this.showSelectedOnly;
            btnShowSelected.style.background = this.showSelectedOnly ? 'rgba(167, 139, 250, 0.3)' : '';
            this.renderList();
        };"""

content = content.replace(old_btn_click, new_btn_click)

# 3. Add createGroupHeader function
group_header_func = """    private createGroupHeader(titleText: string, color: string, fontSize: string, allIds: string[]): HTMLElement {
        const lbl = document.createElement('label');
        lbl.style.cssText = `display:flex; align-items:center; gap:6px; font-weight: 600; font-size: ${fontSize}; color: ${color}; padding: 4px 0; border-bottom: 1px solid rgba(148,163,184,0.1); margin-bottom: 4px; cursor: pointer; user-select: none;`;
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        
        const allChecked = allIds.length > 0 && allIds.every(id => this.checkedIds.has(id));
        const someChecked = allIds.some(id => this.checkedIds.has(id));
        cb.checked = allChecked;
        if (someChecked && !allChecked) {
            cb.indeterminate = true;
        }
        cb.style.cssText = 'margin: 0; accent-color: #a78bfa;';
        
        cb.onchange = () => {
            const willCheck = cb.checked;
            if (willCheck) {
                allIds.forEach(id => this.checkedIds.add(id));
            } else {
                allIds.forEach(id => this.checkedIds.delete(id));
            }
            this.updateMap();
            
            const scroll = this.listContainer.scrollTop;
            this.renderList();
            this.listContainer.scrollTop = scroll;
        };

        const span = document.createElement('span');
        span.innerText = titleText;
        
        lbl.appendChild(cb);
        lbl.appendChild(span);
        return lbl;
    }
"""

content = content.replace('    private renderList', group_header_func + '\n    private renderList')

# 4. Modify renderList signature
content = content.replace('private renderList(showSelectedOnly: boolean = false)', 'private renderList()')

# 5. Modify createCheckboxItem call in renderList
content = content.replace('showSelectedOnly', 'this.showSelectedOnly')

# 6. Replace the entire types.forEach loop to support collecting IDs and prepending group headers
old_loop_pattern = r'        types\.forEach\(type => \{.*?        \}\);'

new_loop = """        types.forEach(type => {
            const typeData = this.boundaryIndex![type];
            if (!typeData) return;

            const typeDiv = document.createElement('div');
            typeDiv.style.marginBottom = '8px';
            
            let typeHasItems = false;
            let typeAllIds: string[] = [];

            if (type === 'ACC') {
                const accData = typeData as any;
                const subcats = Object.keys(accData).sort();
                
                subcats.forEach(sub => {
                    const subSec = accData[sub];
                    const subNames = Object.keys(subSec).sort();
                    
                    const subDiv = document.createElement('div');
                    subDiv.style.marginLeft = '8px';
                    subDiv.style.marginBottom = '6px';
                    
                    let subHasItems = false;
                    let subAllIds: string[] = [];

                    const childrenContainer = document.createElement('div');

                    subNames.forEach(name => {
                        const ids = subSec[name];
                        const item = this.createCheckboxItem(name, ids, query, this.showSelectedOnly);
                        if (item) {
                            childrenContainer.appendChild(item);
                            subAllIds.push(...ids);
                            subHasItems = true;
                        }
                    });

                    if (subHasItems) {
                        const subHeader = this.createGroupHeader(sub, '#cbd5e1', '12px', subAllIds);
                        subHeader.style.fontWeight = '500';
                        subDiv.appendChild(subHeader);
                        subDiv.appendChild(childrenContainer);
                        
                        typeDiv.appendChild(subDiv);
                        typeAllIds.push(...subAllIds);
                        typeHasItems = true;
                    }
                });

            } else {
                // TMA and CTR
                const tmaCtrData = typeData as { [name: string]: string[] };
                const names = Object.keys(tmaCtrData).sort();
                
                const childrenContainer = document.createElement('div');

                names.forEach(name => {
                    const ids = tmaCtrData[name];
                    const item = this.createCheckboxItem(name, ids, query, this.showSelectedOnly);
                    if (item) {
                        childrenContainer.appendChild(item);
                        typeAllIds.push(...ids);
                        typeHasItems = true;
                    }
                });
                
                if (typeHasItems) {
                    typeDiv.appendChild(childrenContainer);
                }
            }

            if (typeHasItems) {
                const typeHeader = this.createGroupHeader(`🛰️ ${type} Boundaries`, '#a78bfa', '13px', typeAllIds);
                typeDiv.insertBefore(typeHeader, typeDiv.firstChild);
                this.listContainer.appendChild(typeDiv);
                totalRendered++;
            }
        });"""

content = re.sub(old_loop_pattern, new_loop, content, flags=re.DOTALL)

with open(modal_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("BoundariesModal rewritten successfully.")
