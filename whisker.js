/**
 * Whisker.js
 * A logic-less and extensible template engine
 * @author exolution
 * @version
 * v0.3.9 fix expression in defer
 * @change-log
 *      v0.3.8 add renderSimple &fix some bug
 *      v0.3.7 fix some bug
 *
 *
 * */
;
!function () {
    //解析状态
    var _ParseState = {OUT_SECTION: 0,IN_SECTION: 1},
        _config={},
        _simpleRenderReg,
        _regReserved=function(){//生成正则表达式的保留字表 用于决定是否转义
            var tok='^$()[]{}.?+*|'.split(''),res={};
            for(var i=0;i<tok.length;i++){
                res[tok[i]]=true;
            }
            return res;
        }();
    function resolveChar(ch, context) {
        var nch, handler;
        if (context.state != _ParseState.IN_SECTION && _config.delimeter.isBegin(ch,context.idx,context.html)) {
            nch = context.html.charAt(context.idx + _config.delimeter.beginNum);
            if (SectionManager.filter(nch)) {
                context.Block().result.push(context.text);
                context.text = '';
                context.state = _ParseState.IN_SECTION;
                context.sectionType = nch;
                SectionManager.emit('SectionStart',nch,context);
                context.idx+= _config.delimeter.beginNum;
            }
            else {
                if(ch==='\n'){
                    ch='\\n';
                }
                if(ch=='\r'){
                    ch='';
                }
                context.text += ch;
            }
        }
        else if (context.state == _ParseState.IN_SECTION) {
            var sectionType=context.sectionType;
            if (_config.delimeter.isEnd(ch,context.idx,context.html)) {
                context.state = _ParseState.OUT_SECTION;
                SectionManager.emit('SectionEnd',sectionType,context,context.sectionContent[sectionType]);
                context.sectionContent[sectionType] = '';
                context.idx+=_config.delimeter.endNum-1;
            }
            else {
                if(!SectionManager.emit('InSection',sectionType,context,ch)){
                    context.sectionContent[sectionType] += ch;
                }

            }
        }
        else {
            if(ch==='\n'){
                ch='\\n';
            }
            if(ch=='\r'){
                ch='';
            }
            context.text += ch;
        }
    }

    var SectionManager=function(){//section管理器
        var _handlers={},typeList='',_filterReg;
        return {
            typeList:'',
            filter:function(sectionType){
                return _filterReg.test(sectionType);
            },
            register:function(sectionType,handlers){
                _handlers[sectionType]={};
                this.typeList+=sectionType;
                _filterReg=new RegExp('['+this.typeList+']');
                for(var key in handlers){
                    //把时间注册中的on滤掉 放到这里而不再emit加上on 是因为注册时间函数性能再差也没事 解析模板时用不着他
                    if(handlers.hasOwnProperty(key)){
                        _handlers[sectionType][key.replace(/^on/,'')]=handlers[key];
                    }
                }

            },
            emit:function(type,sectionType,context,info){
                if(_handlers[sectionType]&&_handlers[sectionType][type]){
                    _handlers[sectionType][type](context,info);
                    return true;
                }
                else {
                    return false;
                }
            }
        }

    }();





    SectionManager.register('$',  {

        onSectionEnd:function(context,sectionContent){
            context.saveVar(sectionContent,'property');
        },
        onInSection:function(context,ch){
            if(/[$^_a-zA-Z0-9.]/.test(ch)){
                context.sectionContent[context.sectionType] += ch;
            }
            else {

                context.text += _config.delimeter.begin + context.sectionType + context.sectionContent[context.sectionType] + ch;
                context.state = _ParseState.OUT_SECTION;
                context.sectionContent[context.sectionType]='';

            }

        }
    });
    SectionManager.register('#',  {
        onSectionStart:function (context) {

        },
        onSectionEnd:function(context,sectionContent){
            var split=sectionContent.indexOf(' ');
            var blockName=sectionContent.substring(0,split);
            var blockArgs=sectionContent.slice(split+1);

            var blockInfo=BlockManager.process('BlockStart',blockName,context,blockArgs);

            if(blockInfo!=false){

                context.newBlock(blockName,blockInfo&&blockInfo.scope||blockArgs.slice(1),blockInfo&&blockInfo.handler);
            }
        }

    });
    SectionManager.register('/', {
        onSectionStart:function (context) {

        },
        onSectionEnd:function(context,sectionContent){


            if(BlockManager.process('BlockEnd',sectionContent,context)!=false){
                if(context.Block().blockName==sectionContent){
                    context.closeBlock();
                }
                else{
                    console.warn(123);
                }
            }


        }


    });
    SectionManager.register('@', {
        onSectionStart:function (context) {

        },
        onSectionEnd:function(context,sectionContent){
        }

    });
    SectionManager.register('%', {
        onSectionStart:function (context) {

        },
        onSectionEnd:function(context,sectionContent){
        },
        onInSection:function(context,ch){
        }

    });

    function Block(name, blockArgs,handler){
        this.result=[];
        this.branchStack= [];
        this.blockName=name;
        this.blockArgs=blockArgs;
        this.blockScope=blockArgs;
        this.handler=handler;
        this.type='block';
    }
    Block.prototype={
        resolve:function(scope){
            var result='';
            scope=scope||this.blockScope;
            for(var i=0;i<this.result.length;i++){
                var varNode=this.result[i];
                if(typeof varNode=='object'){
                    result+=VarNodeManager.handle(varNode,scope);
                }
                else{
                    result+="+'"+varNode.toString()+"'";
                }
            }
            return result;
        }
    };

    function Context(html, scope,partials) {//解析的上下文 整个模板解析过程都依赖这个结构
        scope=scope||{};
        this.blockStack = [ //块结构 用于处理嵌套结构
            new Block('','_scope_')
        ];

        this.text = '';//当前解析的文本
        this.idx = 0;//解析索引
        this.skipMode = false;//忽略模式 最外层block的if语句会及时求值如果条件为false 则会进入忽略模式 忽略模式忽略所有内容的解析，直到if块的结束
        this.scope = scope;//全局的作用域对象 （整个模板被定义为一个块 最外层的块 这个记录该块的作用与对象 其实就是用户传给模板引擎的对象）
        this.sectionContent = {};//储存解析过程中块的内容即{}之间的文本
        this.partials=partials||{};
        this.html = html;//模板
        this.htmlStack=[];
        this.deferEval = false;//延时求值模式 除了最外层的块 任何一个块里的解析都不会立即求值只会暂存 因为当前块的scope由上层块决定 此时无法确定
        this.Block = function () {
            return this.blockStack[this.blockStack.length - 1];
        };

        for (var i = 0; i < SectionManager.typeList.length; i++) {
            this.sectionContent[SectionManager.typeList.charAt(i)] = '';
        }
    }


    Context.prototype = {
        startPartials:function(name){
            var partials = this.partials[name];
            if (partials) {
                this.htmlStack.push({html: this.html, idx: this.idx + 1});
                this.html = partials;
                this.idx = -1;
            }
            else {
                //this.throwError('undefined partials! :"' + name + '"');
            }
        },
        endPartials:function(){
            if(this.idx>=this.html.length&&this.htmlStack.length>0){
                do{
                    var obj=this.htmlStack.pop();
                    this.html=obj.html;
                    this.idx=obj.idx;
                }
                while(this.idx>=this.html.length&&this.htmlStack.length>0);
            }
        },

        saveVar: function (exp, type) {//在当前结果集里储存一个节点 节点类型由type确定 可能是一个延时求值的节点 可能是一个嵌套的block
            this.Block().result.push({ exp: exp, type: type, idx: this.idx});
        },

        newBlock: function (name, blockArgs,handler) {//新建block 其实就是当前block入栈


            this.blockStack.push(new Block(name,blockArgs,handler));
        },
        closeBlock: function () {//结束当前block
            var curBlock = this.blockStack.pop();
            if (curBlock.branchStack.length > 0) {
                //this.throwError('unclosed if!', this);
            }
            this.Block().result.push(curBlock);
        },
        resolve:function(){
            return 'var result=\'\';\nresult=\'\''+this.Block().resolve()+';\nreturn result;';
        }

    };
    var VarNodeManager=function(){
        var _handlers={};
        return {
            register:function(type,handler){
                _handlers[type]=handler;
            },
            handle:function(varNode,scope){
                //scope=scope||varNode.blockScope||blockScope;
                return _handlers[varNode.type](varNode,scope);
            }
        }
    }();
    function evalExp(scope,exp){
        if(exp){
            if(exp.charAt(0)=='^'){
                scope=scope.substring(0,scope.indexOf('['));
                exp=exp.slice(1);
            }
            if(exp.charAt(0)=='$'){
                return exp.slice(1);
            }
            var idx=0,lidx=0;
            while((idx=exp.indexOf('../',idx+1))!=-1){

                scope=scope.substring(0,scope.lastIndexOf('['));
                lidx=idx+3;
            }
            if(lidx>0){
                exp=exp.slice(lidx);
            }

            var tok=exp.split(/\.|\//),result='';
            result+=scope;
            for(var i=0;i<tok.length;i++){
                result+='[\''+tok[i]+'\']';
            }
            return result;
        }
        else {
            return scope;
        }
    }
    VarNodeManager.register('property',function(varNode,scope){

        return '+'+evalExp(scope,varNode.exp);
    });
    VarNodeManager.register('if',function(varNode,scope){
        
        var exp=varNode.exp.replace(/\$((\.\.\/)*[a-zA-Z0-9^.]*)/g,function(a,b){
            return evalExp(scope,b);
        });
        return ";\nif("+exp+"){\nresult+=''";
    });
    VarNodeManager.register('endif',function(varNode,scope){
        return ";\n}\nresult+=''";
    });
    VarNodeManager.register('elseif',function(varNode,scope){
        var exp=varNode.exp.replace(/\$((\.\.\/)*[a-zA-Z0-9^.]*)/g,function(a,b){
            return evalExp(scope,b);
        });
        return ";\n elseif("+exp+"){\nresult+=''";
    });
    VarNodeManager.register('else',function(varNode,scope){
        return ";\n else {\nresult+=''";
    });
    VarNodeManager.register('block',function(varNode,scope){
        var result=';\n';
        result+=BlockManager.handle(varNode,scope);
        return result;
    });


    var BlockManager=function(){
        var _syntaxSnippets={},_processors={};
        function _resolveSyntaxNode(type){
            if(type.indexOf('$Body')!=-1){
                return {
                    type:'$Body',
                    args:/\(([^)]*)\)/.exec(type)[1]
                }
            }
            else if(type.indexOf('$Param')!=-1){
                return {
                    type:'$Param',
                    args:type.slice(-1)
                }
            }
            else {
                return '';
            }
        }
        return {
            registerProcessor:function(blockName,processor){
                _processors[blockName]={};
                for(var key in processor){

                    if(processor.hasOwnProperty(key)){
                        _processors[blockName][key.replace(/^on/,'')]=processor[key];
                    }
                }
            },
            process:function(type,blockName,context,blockArgs){
                var processor=_processors[blockName]&&_processors[blockName][type];
                if(processor){
                    return processor(context,blockArgs);

                }
                return undefined;

            },
            registerHandler:function(blockName,handler){
                var code=handler.toString(),syntaxSnippets=[];
                code=code.slice(code.indexOf('{')+1,-1);
                var splitReg=/\$Body\(([^)]*)\)|\$Param\d/g;
                var codeSplits;
                var lastIndex=0;
                while(codeSplits=splitReg.exec(code)){
                    var codeFrag=code.substring(lastIndex,codeSplits.index);
                    lastIndex=codeSplits.index+codeSplits[0].length;
                    syntaxSnippets.push(codeFrag);
                    syntaxSnippets.push(_resolveSyntaxNode(codeSplits[0]));
                }
                if(lastIndex<code.length){
                    codeFrag=code.slice(lastIndex);
                    syntaxSnippets.push(codeFrag);
                }

                _syntaxSnippets[blockName]=syntaxSnippets;
                console.log(syntaxSnippets);
            },
            handle:function(block,scope){

                if(block.handler){
                    var syntaxSnippets=_syntaxSnippets[block.blockName+'.'+block.handler.namespace];
                }
                else{
                    syntaxSnippets=_syntaxSnippets[block.blockName];
                }
                var result='!function($Scope){';
                scope=block.blockScope=evalExp(scope,block.blockArgs);

                if(syntaxSnippets){
                    for(var i=0;i<syntaxSnippets.length;i++){
                        var snippet=syntaxSnippets[i];
                        if(typeof snippet=='object'){
                            if(snippet.type=='$Body'){
                                result+='\'\''+block.resolve(snippet.args);
                            }
                            else if(snippet.type=='$Param'){
                                result+=block.handler[snippet.args];
                            }
                        }
                        else {
                            result+=snippet.replace(/^\s*|\s*$/g,'');
                        }
                    }
                    return result+'}('+scope+');\nresult+=\'\'';
                }
                else{
                    return '';
                }
            }
        }
    }();
    BlockManager.registerProcessor('if',{
        onBlockStart:function(context,blockArgs){

            context.saveVar(blockArgs,'if');
            return false;
        },
        onBlockEnd:function(context,blockArgs){
            context.saveVar('','endif');
        }
    });
    BlockManager.registerProcessor('elseif',{
        onBlockStart:function(context,blockArgs){
            context.saveVar(blockArgs,'branch');
            return false;
        },
        onBlockEnd:function(){
            return false;
        }
    });
    BlockManager.registerProcessor('else',{
        onBlockStart:function(context,blockArgs){
            context.saveVar(blockArgs,'else');
            return false;
        }
        ,
        onBlockEnd:function(){
            return false;
        }
    });
    BlockManager.registerProcessor('each', {
        onBlockStart: function (context,blockArgs) {
            var params = /^\$(\^?[a-zA-Z0-9_.$]*)(?:\(\$([a-zA-Z0-9_]+)=>\$([a-zA-Z0-9_]+)\))?$/.exec(blockArgs);
            if (blockArgs) {
                if (params[2] && params[3]) {

                    return{
                        scope: params[1],
                        handler: {
                            namespace: 'forin',
                            1: params[2],
                            2: params[3]
                        }
                    }
                }
                else {
                    return {};
                }
            }
            else {
                console.log('error');
            }
        }
    });
    BlockManager.registerHandler('each',function($Scope,$Body){
        for(var index=0;index<$Scope.length;index++){
            var seq=index+1;
            result+=$Body($Scope[index]);
        }
    });
    BlockManager.registerHandler('each.forin',function($Scope,$Body){
        for(var i=0;i<$Scope.length;i++){
            var scope={
                $Param2:$Scope[i],
                $Param1:i
            };
            result+=$Body(scope);
        }
    });
    function render(html, data,partials) {
        if (!html) {
            return html;
        }
        var ch = '',
            context = new Context(html, data,partials);
        while (context.idx < context.html.length) {
            ch = context.html.charAt(context.idx);
            resolveChar(ch, context);
            if (context.error) {
                break;
            }

            context.idx++;
            context.endPartials();

        }
        if (context.error) {
            return context.errorMsg;
        }
        if (context.blockStack.length > 1) {
            var blockName=context.Block().blockName;
            //context.throwError('{#' + blockName + '} need a close block "{/' + blockName + '}"');
        }

        var code= context.resolve();
        return new Function('_scope_',code);


    }

    function setSimpleReg(begin,end){
        var simpleReg=begin+'$#'+end;
        simpleReg=simpleReg.replace(/./g,function(a){
            if(_regReserved[a]){
                return '\\'+a;
            }
            else if(a=='#'){
                return '([_a-zA-Z0-9]*)';
            }
            else {
                return a;
            }
        });
        return new RegExp(simpleReg,'g');
    }

    function Delimeter(begin,end){
        end=end||begin;
        if(begin.length+end.length<=4){
            this.beginNum=begin.length;
            this.begin=begin;
            if(this.beginNum>1){
                this.b=[begin.charAt(0),begin.charAt(1)];
            }
            this.endNum=end.length;
            this.end=end;
            if(this.endNum>1){
                this.e=[end.charAt(0),end.charAt(1)];
            }
        }
        else{
            console&&console.warn&&console.warn('max delimeter length is 2');
        }
        _simpleRenderReg=setSimpleReg(begin,end)
    }
    Delimeter.prototype={
        isBegin:function(ch,idx,text){

            if(this.beginNum==1){
                return ch==this.begin;
            }
            else{
                return ch==this.b[0]&&text.charAt(idx+1)==this.b[1];
            }
        },
        isEnd:function(ch,idx,text){

            if(this.endNum==1){
                return ch==this.end;
            }
            else{
                return ch==this.e[0]&&text.charAt(idx+1)==this.e[1];
            }
        }

    };
    _config.delimeter=new Delimeter('{','}');
    window.Whisker={
        render:render
    };

}();