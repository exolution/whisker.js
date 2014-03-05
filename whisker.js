reated with JetBrains PhpStorm.
 * User: godsong
 * Date: 14-2-2
 * Time: 下午10:38
 */
;
!function () {

    var ParseState = {//解析状态
        OUT_BLOCK: 0,
        IN_BLOCK: 1
    };

    function Context(html, scope) {//解析的上下文 整个模板解析过程都依赖这个结构
        this.blockStack = [ //块结构 用于处理嵌套结构
            {
                result: [],//一个块的结果集
                blockName: '',//块名字
                blockArgs: '',//块参数
                blockScope: scope,//块的作用域对象
                type: 'block',//块本身作为结果集里的一种节点 类型就是block
                branchStack: []//分支栈 用于处理if endif嵌套关系的栈
            }
        ];
        this.text = '';//当前解析的文本
        this.idx = 0;//解析索引
        this.skipMode = false;//忽略模式 最外层block的if语句会及时求值如果条件为false 则会进入忽略模式 忽略模式忽略所有内容的解析，直到if块的结束
        this.scope = scope;//全局的作用域对象 （整个模板被定义为一个块 最外层的块 这个记录该块的作用与对象 其实就是用户传给模板引擎的对象）
        this.blockContent = {};//储存解析过程中块的内容即{}之间的文本
        this.html = html;//模板
        this.deferEval = false;//延时求值模式 除了最外层的块 任何一个块里的解析都不会立即求值只会暂存 因为当前块的scope由上层块决定 此时无法确定
        this.Block = function () {
            return this.blockStack[this.blockStack.length - 1];
        };

        for (var i = 0; i < BlockMode.mode.length; i++) {
            this.blockContent[BlockMode.mode.charAt(i)] = '';
        }
    }


    Context.prototype = {

        saveVar: function (exp, type) {//在当前结果集里储存一个节点 节点类型由type确定 可能是一个延时求值的节点 可能是一个嵌套的block
            this.Block().result.push({ exp: exp, type: type, idx: this.idx});
        },
        saveBranch: function (criteria) {//在当前的结果集里储存一个分支节点（即if 该节点结构中包含其else节点列表 以控制流程）
            var branchNode = {type: 'branch', exp: criteria, elseGroup: []};
            var block = this.Block();
            block.result.push(branchNode);
            block.branchStack.push(branchNode);
        },
        setElse: function (criteria, flag) {//在当前的结果集里储存一个else节点 并更新到当前的if节点的else列表中
            var block = this.Block();
            var branch = block.branchStack[block.branchStack.length - 1];
            var elseNode = {exp: criteria, If: branch, flag: flag, type: 'else'};
            if (!branch) {
                this.throwError('else or else if need a if in this block "' + block.blockName + '"', this);
                return;
            }
            var prevElse = branch.elseGroup[branch.elseGroup.length - 1];
            if (prevElse && prevElse.flag && !criteria) {
                this.throwError('else if or else can\'t after else', this);
            }
            if (!prevElse) {
                prevElse = branch;
            }
            prevElse.nextIndex = block.result.length;
            block.result.push(elseNode);
            branch.elseGroup.push(elseNode);
        },
        endBranch: function () {//闭合分支节点

            var block = this.Block();
            var branch = block.branchStack.pop();
            if (branch) {
                branch.endIndex = block.result.length;
                var lastElse = branch.elseGroup[branch.elseGroup.length - 1];
                if (lastElse) {
                    lastElse.nextIndex = block.result.length;
                }
            } else {
                this.throwError('{/if} need a if', this);
            }
        },
        newBlock: function (name, args, scope) {//新建block 其实就是当前block入栈
            this.blockStack.push({
                result: [],
                branchStack: [],
                blockName: name,
                blockArgs: args,
                blockScope: scope || this.Block().blockStack,
                type: 'block',
                idx: this.idx,
                parent: this.Block()
            });

        },
        closeBlock: function () {//结束当前block
            var cur = this.blockStack.pop();
            if (cur.branchStack.length > 0) {
                this.throwError('unclosed if!', this);
            }
            this.Block().result.push(cur);
            if (this.blockStack.length == 1) {
                this.deferEval = false;
            }
        },
        test: function (scope, exp) {//条件表达式测试
            var self = this, oldExp = exp;

            exp = exp.replace(/\$([_a-zA-Z0-9.]*)/g, function (a, b) {
                var v = self.eval(scope, b);
                if (typeof v == 'string') {
                    v = '"' + v + '"';
                }
                else if (v == undefined) {
                    return 'undefined';
                }
                else if (typeof v == 'object') {
                    return !!v;
                }
                return v.toString();
            });

            try {
                var f = eval(exp);
            }
            catch (e) {
                this.throwError('criteria error :"' + oldExp + '" real value="' + exp + '"');
            }
            return f;
        },
        invoke: function (scope, exp, bind) {//调用方法
            var ret = /\((.*)\)/.exec(exp);
            if (ret && ret[1]) {
                var tok = ret[1].split(','), args = [];
                for (var i = 0; i < tok.length; i++) {
                    var val = tok[i];
                    if (!isNaN(+val)) {
                        args.push(+val);
                    }
                    else if (val.charAt(0) == "'" && val.charAt(val.length - 1) == "'") {
                        args.push(val);
                    }
                    else if (/^\$[_a-zA-Z0-9.]*$/.test(val)) {
                        args.push(this.eval(scope, val.slice(1)));
                    }
                    else {
                        this.throwError('unrecognized arguments "' + val + '" for invoke "' + exp + '"', this);
                    }
                }
            }
            else {
                args = [];
            }
            i = exp.indexOf('(');
            if (i != -1) {
                exp = exp.slice(0, i);
            }
            var func = NativeMethod[exp] || this.eval(scope, exp);
            return func && func.apply(scope, args);
        },
        eval: function (scope, exp) {//求解变量的值
            var idx = 0,
                name,
                curObj = scope;
            if (!exp) {
                return scope;
            }
            exp = exp.replace(/\$([^.]*)/g, function (a, b) {//解析$表达式中的$xx替换成其值的字面量
                return curObj[b];
            });
            if (exp.charAt(0) == '^') {
                curObj = this.scope;
                exp = exp.slice(1);
            }
            if (exp.charAt(0) == '.') {
                exp = exp.slice(1);
            }
            var tok = exp.split('.');
            while (name = tok[idx++]) {
                curObj = curObj[name];
                if (typeof curObj != 'object') {
                    break;
                }
            }
            if (curObj == undefined) {
                var curBlock = this.curBlock || this.Block();
                while (curBlock = curBlock.parent) {
                    curObj = curBlock.blockScope;
                    idx = 0;
                    while (name = tok[idx++]) {
                        curObj = curObj[name];
                        if (typeof curObj != 'object') {
                            break;
                        }
                    }
                    if (curObj != undefined) {
                        break;
                    }
                }
            }
            return curObj;
        },
        resolveBlock: function (block, scope) {//计算一个块的结果

            block = block || this.Block();
            scope = scope || block.blockScope;
            this.curBlock = block;
            block.blockScope = scope;
            var ctx = {i: 0, result: ''};
            for (ctx.i = 0; ctx.i < block.result.length; ctx.i++) {
                var varNode = block.result[ctx.i];
                if (typeof varNode == 'object') {
                    if (varNode.idx >= 0) {
                        this.idx = varNode.idx;
                    }
                    VarNodeManager.handlers[varNode.type].call(this, varNode, scope, ctx);
                }
                else {
                    ctx.result += varNode;
                }

            }
            return ctx.result;
        },

        throwError: function (msg) {//抛出错误 会显示错误位置
            msg = 'Parse Error:' + msg;

            var stack = this.html.substring(this.idx - 40, this.idx) + '"' + this.html.charAt(this.idx) + '"' + this.html.substring(this.idx + 1, this.idx + 40);
            if (console && typeof console.log == 'function') {
                console.log(msg + '\n at: ' + stack);
            }
            this.errorMsg = msg + '\n at: ' + stack;
            this.error = true;
        }
    };
    var Format = {
        after: function (context) {
            var nextChar = context.html.charAt(context.idx + 1);
            if (nextChar == '\n') {
                context.idx++;
            }
            if (nextChar == '\r') {
                context.idx++;
                if (context.html.charAt(context.idx + 1) == '\n') {
                    context.idx++;
                }
            }
        },
        before: function (context) {//格式化
            var result = context.Block().result,
                prev = result[result.length - 1];
            if (typeof prev == 'string') {
                var len = prev.length, ct = len;
                while (prev.charAt(--len) == ' ') {
                    ct--;
                }
                result[result.length - 1] = prev.slice(0, ct)
            }

        }
    };
    var NativeMethod = {
        add: function (name, func) {
            this.name = func;
        }
    };
    var BlockMode = {//块模式管理器 $#/
        mode: '',
        addMode: function (mode, handler) {
            this.mode += mode;
            this.filter = new RegExp('[' + this.mode + ']');
            this.handlers[mode] = handler;
        },
        handlers: {}
    };


    function resolveChar(ch, context) {
        var nch, handler;
        if (context.state != ParseState.IN_BLOCK && ch == '{') {
            nch = context.html.charAt(context.idx + 1);
            if (BlockMode.filter.test(nch)) {
                if (!context.skipMode) {
                    context.Block().result.push(context.text);
                    context.text = '';
                }
                context.state = ParseState.IN_BLOCK;
                context.blockType = nch;
                handler = BlockMode.handlers[nch];
                handler.onStartBlock && handler.onStartBlock(context);
                context.idx++;
            }
            else {
                if (!context.skipMode) {
                    context.text += ch;
                }
            }
        }
        else if (context.state == ParseState.IN_BLOCK) {
            if (ch == '}') {
                context.state = ParseState.OUT_BLOCK;
                var blockContent = context.blockContent[context.blockType];
                handler = BlockMode.handlers[context.blockType];
                context.blockContent[context.blockType] = '';
                handler.onEndBlock && handler.onEndBlock(blockContent, context);

            }
            else {
                handler = BlockMode.handlers[context.blockType];
                if (handler.onInBlock) {
                    handler.onInBlock(ch, context);
                }
                else {
                    context.blockContent[context.blockType] += ch;
                }
            }
        }
        else {
            if (!context.skipMode) {
                context.text += ch;
            }
        }
    }

    var VarNodeManager = {
        handlers: {},
        add: function (type, func) {
            this.handlers[type] = func;
        }
    };
    VarNodeManager.add('method', function (varNode, scope, ctx) {

        ctx.result += this.invoke(scope, varNode.exp);
    });
    VarNodeManager.add('property', function (varNode, scope, ctx) {
        ctx.result += this.eval(scope, varNode.exp)
    });
    VarNodeManager.add('branch', function (varNode, scope, ctx) {
        var criteria = this.test(scope, varNode.exp);
        if (criteria) {
            varNode.flag = true;
        }
        else {
            varNode.flag = false;
            ctx.i = (varNode.nextIndex || varNode.endIndex) - 1;

        }
    });
    VarNodeManager.add('else', function (varNode, scope, ctx) {
        if (varNode.If.flag == true) {
            ctx.i = varNode.If.endIndex - 1;
        }
        else {
            if (varNode.flag || (varNode.flag == undefined && this.test(scope, varNode.exp))) {
                varNode.If.flag = true;
            }
            else {
                ctx.i = varNode.nextIndex - 1;
            }
        }
    });
    VarNodeManager.add('block', function (varNode, scope, ctx) {
        varNode.blockScope = scope;
        ctx.result += GroupManager[varNode.blockName].onClose.call(varNode.blockName, this, varNode);
    });
    var MethodHandler = {
        onEndBlock: function (blockContent, context) {
            if (!context.skipMode) {
                if (context.deferEval) {
                    context.saveVar(blockContent, 'method');
                }
                else {
                    var block = context.Block();
                    block.result.push(context.invoke(block.blockScope, blockContent));
                }
            }
        }
    };

    var PropertyHandler = {
        onEndBlock: function (blockContent, context) {

            if (!context.skipMode) {
                if (context.deferEval) {

                    context.saveVar(blockContent, 'property');
                }
                else {
                    block = context.Block();
                    var res = context.eval(block.blockScope, blockContent);
                    if (typeof res == 'object') {
                        res = res.toString();
                    }
                    block.result.push(res);
                }
            }
        },
        onInBlock: function (ch, context) {
            if (!context.skipMode) {
                if (/[$^_a-zA-Z0-9.]/.test(ch)) {
                    context.blockContent[context.blockType] += ch;
                }
                else {
                    context.text += '{' + context.blockType + context.blockContent[context.blockType] + ch;
                    context.state = ParseState.OUT_BLOCK;
                }
            }
        }
    };
    var GroupHandler = {
        onStartBlock: Format.before,
        onEndBlock: function (blockContent, context) {
            var split = blockContent.indexOf(' ');
            if (split == -1) {
                split = blockContent.length;
            }
            var blockName = blockContent.substring(0, split),
                blockArgs = blockContent.slice(split + 1).replace(/^ *| *$/g, ''),
                group = GroupManager[blockName];

            if (group) {
                if (context.skipMode) {
                    group.onSkipBegin && group.onSkipBegin(context, blockArgs);
                }
                else {
                    group.onBegin && group.onBegin.call(blockName, context, blockArgs);
                }

            }
            else {
                if (console && console.log) {
                    console.log('Warning:unidentified group name:' + blockContent);
                }
            }
            Format.after(context);
        }
    };

    var EndGroupHandler = {
        onStartBlock: function (context) {
            var result = context.Block().result,
                prev = result[result.length - 1];
            if (typeof prev == 'string') {//格式化
                var len = prev.length, ct = len;
                while (prev.charAt(--len) == ' ') {
                    ct--;
                }
                result[result.length - 1] = prev.slice(0, ct)
            }
        },
        onEndBlock: function (blockContent, context) {
            var group = GroupManager[blockContent];
            if (group) {
                if (context.skipMode) {
                    group.onSkipClose && group.onSkipClose(context);
                } else {
                    if (group.onClose) {

                        var result = group.onClose.call(blockContent, context, context.Block());
                        if (result != undefined) {
                            context.Block().result.push(result);
                        }

                    }
                    else {
                        if (console && console.log) {
                            console.log('Warning:group "' + blockContent + '" need a onClose Handler');
                        }
                    }
                }
            }


            Format.after(context);
        }
    };
    BlockMode.addMode('$', PropertyHandler);
    BlockMode.addMode('#', GroupHandler);
    BlockMode.addMode('/', EndGroupHandler);
    BlockMode.addMode('@', MethodHandler);
    BlockMode.addMode('%', {
        onEndBlock: function (blockContent, context) {
            var block = context.Block();
            var exp = blockContent.replace(/\$([_a-zA-Z0-9.]*)/g, function (a, b) {
                var v = context.eval(block.blockScope, b);
                if (typeof v == 'string') {
                    v = '"' + v + '"';
                }
                else if (v == undefined) {
                    return 'undefined';
                }
                else if (typeof v == 'object') {
                    return !!v;
                }
                return v.toString();
            });
            try {
                var res = eval(exp);
            } catch (e) {
                context.throwError('%express error:"' + blockContent + '" real value="' + exp + '"');
            }
            context.Block().result.push(res);
        }
    });
    BlockMode.addMode('!', {
        onEndBlock: function (b, context) {

        }
    });
    var GroupManager = {
        register: function (name, handler) {
            this[name] = handler;
        }
    };
    var blockHandler = {
        onBegin: function (context, blockArgs) {
            context.newBlock(this.valueOf(), blockArgs, context.Block().blockScope);
            context.deferEval = true;

        },
        onClose: function (context, block) {
            if (block.blockName == this) {//this为当前的blockname

                if (!context.deferEval) {
                    return BlockManager[this](context, block);
                }
                else {
                    context.closeBlock();
                }
            }
            else {
                context.throwError('unmatched {/' + this + '}', context);
            }
        }
    };
    var BlockManager = {
        register: function (name, handler) {
            this[name] = handler;
            GroupManager.register(name, blockHandler);
        }
    };
    BlockManager.register('each', function (context, block) {
        var result = '';
        var params = /^\$([a-zA-Z0-9_.]*)(?:\(\$([a-zA-Z0-9_]+)=>\$([a-zA-Z0-9_]+)\))?$/.exec(block.blockArgs);
        if (params) {
            block.blockScope = context.eval(block.blockScope, params[1]);
            if (params[2]) {
                var key = params[2];
                var val = params[3];
            }
            var list = block.blockScope;

            if (list) {
                if (list.length > 0) {
                    for (var i = 0; i < list.length; i++) {
                        if (key) {
                            var scope = {};
                            scope[key] = i;
                            scope[val] = list[i];
                        }
                        else {
                            scope = list[i];
                        }

                        result += context.resolveBlock(block, scope);
                    }
                }
                else {
                    for (var k in list) {
                        if (key) {
                            scope = {};
                            scope[key] = k;
                            scope[val] = list[k];
                        }
                        else {
                            scope = list[k];
                        }
                        result += context.resolveBlock(block, scope);
                    }
                }
            }
        }
        else context.throwError('can\'t resolve arguments of {each}:"' + block.blockArgs + '"');
        return result;
    });

    GroupManager.register('if', {
        onSkipBegin: function (context) {
            context.Block().branchStack.push(null);
        },
        onBegin: function (context, blockArgs) {
            if (context.deferEval) {
                context.saveBranch(blockArgs);
            }
            else {
                var criteria = context.test(context.Block().blockScope, blockArgs);
                if (criteria) {
                    context.skipMode = false;
                    context.Block().branchStack.push({flag: true});
                }
                else {
                    context.skipMode = true;
                    context.Block().branchStack.push({flag: false});
                }

            }

        },
        onSkipClose: function (context) {
            var If = context.Block().branchStack.pop();

            if (If) {
                context.skipMode = false;
            }

        },
        onClose: function (context) {

            if (context.deferEval) {
                context.endBranch();
                context.skipMode = false;
            }
            else {
                var If = context.Block().branchStack.pop();
                if (If) {
                    context.skipMode = false;
                }
                if (If == undefined) {
                    context.throwError('unmatched /if', context);
                }
            }
        }
    });
    GroupManager.register('else', {
        onSkipBegin: function (context) {
            var branchStack = context.Block().branchStack;
            var If = branchStack[branchStack.length - 1];
            if (If) {
                context.skipMode = If.flag;
            }

        },
        onBegin: function (context, blockArgs) {
            if (context.deferEval) {
                context.setElse('', true);
            }
            else {
                var branchStack = context.Block().branchStack;

                var If = branchStack[branchStack.length - 1];
                if (branchStack.length == 0) {
                    context.throwError('else need a if', context);
                }
                if (If) {
                    context.skipMode = If.flag;
                }

            }
        }
    });
    GroupManager.register('elseif', {
        onSkipBegin: function (context, blockArgs) {

            var branchStack = context.Block().branchStack,
                If = branchStack[branchStack.length - 1];
            if (If) {
                if (!If.flag) {
                    var criteria = context.test(context.Block().blockScope, blockArgs);
                    if (criteria) {
                        context.skipMode = false;
                        If.flag = true;
                    }
                } else {
                    context.skipMode = true;
                }
            }
        },
        onBegin: function (context, blockArgs) {
            if (context.deferEval) {
                context.setElse(blockArgs);
            }
            else {

                var branchStack = context.Block().branchStack;
                if (branchStack.length == 0) {
                    context.throwError('elseif need a if', context);
                }
                var If = branchStack[branchStack.length - 1];
                if (If) {
                    if (!If.flag) {
                        var criteria = context.test(context.Block().blockScope, blockArgs);
                        if (criteria) {
                            context.skipMode = false;
                            If.flag = true;
                        }
                    }
                    else {
                        context.skipMode = true;
                    }
                }
            }
        }
    });


    function render(html, data) {
        var ch = '',
            context = new Context(html, data);
        if (!html) {
            return html;
        }
        if (data == undefined || data == null) {
            data = {};
        }
        while (context.idx < html.length) {
            ch = html.charAt(context.idx);
            resolveChar(ch, context);
            if (context.error) {
                break;
            }
            context.idx++;
        }
        if (context.error) {
            return context.errorMsg;
        }
        if (context.blockStack.length > 1) {
            context.throwError('{#' + context.Block().blockName + '} need a close block "{/' + context.Block().blockName + '}"', context);
        }
        context.Block().result.push(context.text);

        return context.resolveBlock();
    }

    NativeMethod.add('#CALC', function (exp) {
        return new Function('return ' + exp)();
    });
    var whisker = {};
    whisker.Context = Context;
    whisker.GroupManager = GroupManager;
    whisker.BlockMode = BlockMode;
    whisker.render = render;
    whisker.register = function (name, handler) {
        BlockManager.register(name, handler);
    };


    whisker.register('repeat', function (context, block) {
        var args = block.blockArgs, result = '';
        if (args.charAt(0) == '$') {
            args = context.eval(block.blockScope, args.slice(1));
        }

        var n = +args;
        if (isNaN(n)) {
            context.throwError('repeat need a number as its argument! error param:"' + args + '"');
        }
        else {
            for (var i = 0; i < n; i++) {
                result += context.resolveBlock(block, {INDEX: i, SEQ: i + 1});
            }
        }
        return result;

    });

    if (typeof exports === "object" && exports) {
        module.exports = whisker;

    } else {
        if (typeof define === "function") {
            if (define.cmd) { //for cmd
                define(function (require, exports, module) {
                    module.exports = whisker;
                });
            }
            else if (define.amd) { //for amd
                define(whisker);
            }
            else {
                window.Whisker = whisker;
            }

        } else {
            window.Whisker = whisker; // for <script>
        }
    }
}();
