export class Utils {
    static buildDOM(structure, pNode) {
        if(!Array.isArray(structure))
            throw new TypeError('structure must be an instance of Array.');
        if(!!pNode && !(pNode instanceof Node))
            throw new TypeError('pNode must ba an instance of Node.');
        
        let node = null;
        //try to make the HTMLElement node
        if(typeof structure[0] === 'string') {
            try {
                node = document.createElement(structure[0]);
            }
            catch (err) {
                throw new TypeError('Unable to create HTMLElement of type: '+ structure[0]);
            }
        }
        else if(structure[0] instanceof Node) {
            node = structure[0];
        }
        else throw new TypeError('index 0 of structure must be a valid HTMLElement tag name or HTMLElement instance.');
        for(let i = 1; i< structure.length; i++) {
            //recurse for array values
            if(Array.isArray(structure[i]))
                Utils.buildDOM(structure[i], node);
            //object values set attributes of the node defined at index 0
            else if(typeof structure[i] === 'object')
                for(let p in structure[i]) {
                    if(typeof structure[i][p] === 'string')
                        node.setAttribute(p, structure[i][p]);
                }
            //string values are used as text nodes
            else if(typeof structure[i] === 'string')
                node.appendChild(document.createTextNode(structure[i]));
        }
        if(pNode)
            pNode.appendChild(node);
            
        return pNode || node;
    }
    static get ui() {return{
        button: (label) => Utils.buildDOM(['button', { type: 'button' }, label]),
        input: (type, placeholder = '') => Utils.buildDOM(['input', { type, placeholder }]),
        textarea: (placeholder = '') => Utils.buildDOM(['textarea', { placeholder }]),
        label: (text, forId = '') => Utils.buildDOM(['label', { for: forId }, text]),
        select: () => Utils.buildDOM(['select']),
        option: (label, value) => Utils.buildDOM(['option', { value: String(value) }, label]),
        checkbox: (label) => {
            const wrapper = Utils.buildDOM(['label', { style: 'display: flex; gap: 0.25em;' }]);
            const input = Utils.buildDOM(['input', { type: 'checkbox' }]);
            const text = Utils.buildDOM(['span', label]);
            wrapper.append(input, text);
            wrapper.input = input;
            return wrapper;
        },
        fieldset: (legend) => {
            const fieldset = Utils.buildDOM(['fieldset']);
            if (legend) Utils.buildDOM(['legend', legend], fieldset);
            return fieldset;
        },
        status: () => Utils.buildDOM(['output', { role: 'status' }]),
    }}
    static get warnBeforeClosing() {
        return {
            enable: () => window.addEventListener('beforeunload', INTERNAL_warnBeforeClosing),
            disable: () => window.removeEventListener('beforeunload', INTERNAL_warnBeforeClosing)
        }
    }
    static sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

function INTERNAL_warnBeforeClosing(event) {
  event.preventDefault();
  event.returnValue = '';
}