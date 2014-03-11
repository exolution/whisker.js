#Whisker.js v0.3.6 - 轻逻辑&可扩展的js模板引擎

##为什么选择 Whisker.js?

>简单，简洁

像这样的模板代码
```
{$property}
{#group}{/group}
{@method}
{%exp}
```
是不是相对清爽一些？（ 你是不是已经受够了 {{xxx}} ?）

>轻逻辑，但并不是没有一点逻辑

把js逻辑从模板语言中剥离出来，有利于视图和逻辑解耦，使得模板更清晰。
但是很多时候，如果过于简单，则面对复杂的需求时总显得有些力不从心。
所以，一定的逻辑性还是很有必要的。比如if语句支持表达式

>可扩展

whisker.js是遵循开闭原则的精神进行设计和编码。所谓开闭原则即要对扩展开放，对修改关闭。
whisker.js提供了多种层次的扩展性。最高层次可供用户进行扩展。比较底层的供开发者扩展。

>易于调试错误&适配amd cmd模块

whisker解析式会发现错误并报告模板中出现错误的位置，方便调试。并且自己已经适配了amd cmd模块（包括node）可以直接script引用，也可以由遵循这些规范的
模块加载器加载。
>自定义界定符

whisker默认使用{}为界定符 并且支持自定义开始界定符和结束界定符， 最多支持两个字符如'<%','%>'
建议在和后台模板语言冲突（如php的smarty）时才自定义界定符。 因为单字符界定符其他符号容易在js中出现被误解析，而两个字符的界定符多多少少会影响性能~

不依赖任何框架，压缩后仅10k。

##快速上手
一个简单地示例如下
```js
var data={
    name:'张三',
    birth:'1989-02-13',
    getAge:function(birth,虚岁){
            return new Date().getFullYear()-new Date(birth).getFullYear()+虚岁;
        }
    }
var html=Whisker.render("<h1>{$name}</h1><div>年龄:{@getAge($birth,1)}岁</div>",data);
//result："<h1>张三</h1><div>年龄:26岁</div>"
```
上面的代码描述了whisker的基本用法。render函数接受两个必选参数第一个为需要渲染的模板代码，第二个则是渲染数据。
whisker模板中，所有的whisker代码都包括在{}中，由大括号里的第一个字符作为这块whisker代码的语义。
分别包括

* $【属性】
* @【方法】
* #【块操作或者叫组操作】
* /【结束块操作】
* %【表达式求值】
* ！【注释】

下面逐一介绍 whisker的功能

##属性
{$xxx} 代表取属性xxx的值
属性名的允许值和js中标示符的规则大致一致，但略有不同，比如允许数字开头甚至{$1} {$2}

>1、允许使用 “.” 多级访问属性的属性。

例如
```js
var data={
    a:{
        b:2
    }
}
Whisker.render("{$a.b}",data);
```

>2、使用"~"来对将html标签编码成html实体 

仅编码<和> 其他实体也没必要编码 。注意：~必须出新在变量名最前面，变量名中不允许出现~
实例：
```js
var data={
    tag:'<div>abc</div>'
}
Whisker.render('<span>{$~tag}</span>',data);
//result :"<span>&lt;div&gt;abc</div></span>"
```

>使用“^”从根block的scope对象开始取属性

这里需要对block和scope做个解释。block是一块模板代码的抽象。整个模板代码其实就是一个block（称作根block）。一个block会有一个scope object即作用域对象。属性代码（{$xxx}）所取的属性其实就是当前block的作用域对象的属性。在上述的例子中，传递给render函数的那个data就是根block的作用域对象。{$name}能取到data.name的值就是这个原因。

那为什么要引入块呢？是为了处理子作用域和嵌套的问题。通过嵌套子block来描述嵌套。每个block都有他的scope对象（下面简化为scope）。最实际的例子就是each迭代即{#each}{/each}
直接例子说明吧 （下面会具体介绍{#}的用法,这里的{#each}只表明问题不做过多解释）
```js
var data={
   name:'大舌头',
   abc:'abc',
   list:[
    {name:'张山',items:[1,2,3]},
    {name:'李式',items:[4,5]}
   ]
}
var tmpl='{#each $list}'              +
         '<div>{$name}</div>'         +
         '<div>{$abc}{$^name}</div>'  +
            '{#each $items}'          +
            '<span>{$}</span>'        +
            '{/each}'                 +
         '{/each}';
Whisker.render(tmpl,data);
```
为了避免说的过于深入而费解。在这就直接定义：每个each都会创建一个新的block，该block的scope都会变成each的参数，在本例中即list。而且在循环迭代输出时，当前的scope会动态的变成list的每个迭代项。 这里的{$name}引用的正是当前scope的name属性，即{name:'张山'}或者{name:'李式'}的name（循环迭代时决定）。而{$abc}这个怎么办呢？`whikser如果在当前的scope没有发现指定的属性，那它会向上层的block的scope上查找，直到查到根block的scope`。但是如果你想要取外层的name时就不行了，因为它被当前scope里的name屏蔽了。所以这时就需要^了{$^xxx}就代表从最外层的(即根block)的scope（即上述的data）上开始查找属性。这样就可以找到最外面那个name了。
*同时，建议用户在需要取外层scope的属性时，即使没被当前的属性覆盖。也使用^方式查找，因为自动搜索scope链还是比较影响效率的

>$可代表当前的scope对象本身。

在上面那个例子中 迭代循环[1,2,3]时，每次迭代时的scope分别是1 ，2，3 所以用{$}即能取到他们。但是注意，如果当前的scope不是个普通类型（数字，字符串） 则会简单粗暴的使用toString() 额 所以小心输出成[object Object] =。=

>$$属性名替换

属性名中以$开头的属性名 会替换成它的值作为新的属性名，这个可能有点儿拗口和费解。其实就是类似PHP中的$$abc这种， 比如$abc的值是"xxx"那么这个表达式（$$abc）的值就是$xxx这个变量的值。
坦白讲这个功能的实用价值有待考虑~而且这种做法会限制数据中的属性名不能出现$ 此功能考虑去除~或者换标示符 比如#
实例：
```js
var data={
    obj:{
        name:'exolution'
    }
    abc:'name'
}
Whisker.render('{$obj.$abc}',data);
```

##方法
{@func} 代表调用func的这个方法。

取方法的规则和属性一样都是在当前scope上查找 当然，也支持^.
调用方法支持传递参数 如 {@func($name,1,'abc')}，参数必须为下面选项之一
* 数字
* 字符串，须以'  '包裹
* 属性名 如$name

注意：参数不允许出现表达式 如 1+2, $index+1 皆为非法

另外，`调用方法时，方法的this为当前的scope`
示例见第一个例子



##表达式
{%$index+1*(2+3)} 以%开头即表示表达式
其实引入表达式有悖于轻逻辑的初衷，而有时候有不得不需要一些表达式。额，反正少用吧，确实影响效率
* 表达式支持属性（{$xxx}） 暂不支持方法{@xxx} 
* 支持常用的表达式运算操作如加减乘除 逻辑运算，还有三元操作符。
* 支持括号

##块操作/组操作
{#xxx}{/xxx} 由#开头即为快操作或者，组操作 
为啥不全叫块操作呢，因为容易误导，让人觉得每个{#xxx}都会创建新的block。实际上 if就不会。 组操作必须有以/开头的闭合代码，当然，也有例外 else 和elseif 和if共享闭合代码。下面着重内部已经实现的块操作/组操作


###each
这个是基本需求了吧 ，前面也提到了，它会创建新的block，scope也变成了它的参数的值。下面主要讲一下他的参数
each的参数有两种模式
1、单一属性 即$xxx。 这里所有的单一属性都是指上面对于属性的描述，允许. ~ ^操作。
2、as 模式 。这种模式类似php的foreach 形式为：$xxx($aa=>$bb)。
$aa代表迭代索引 可以随意指定，$bb是迭代项名字也可以随意指定。不过引用属性和方法是必须得加上他的名字了即 {$bb.xxx} {@bb.func}。
实例：
```js
var data={
    a:{name:'张山'},
    b:{name:'李师'}
};
Whisker.render('{#each $($key=>$val)} {$key},{$val.name} {/each}',data);//上面也说了 $代表当前scope本身 即data
```

###if else elseif
额这个不用过多解释了吧 说明下参数支持表达式 和上面的{%}一样

P.S.对if做了优化，建议多在最外层使用if 因为能立即判断if的条件 因此如果false可以直接忽略if 里的代码，效率很高。
示例见习面的repeat

###repeat
这个跟each相似，不过他只是简单的重复，而且它不会创建新的block。但是每次循环会创建新的scope
scope包含两个值 一个是 $INDEX 代表循环索引从0递增的数字，另一个是$SEQ 代表循环序号，从1递增的数字
参数：数字常量，或者单一属性  {$xxx} 不支持表达式
示例
```js
var data={
    num:6,
    list:['1-3','4','5-6']
}
var tmpl='{#repeat $num}'                                       +
             '{#if $INDEX<3}{$SEQ} in range:{$list.0}\n'        +
             '{#elseif $INDEX==3}{$SEQ} in range:{$list.1}\n'   +
             '{#else}{$SEQ} in range:{$list.2}\n'               +
             '{/if}'                                            +
         '{/repeat}';
Whisker.render(tmpl,data);
/*result
"1 in range:1-3
2 in range:1-3
3 in range:1-3
4 in range:4
5 in range:5-6
6 in range:5-6
"
*/
```

##导入模板
{<partials} 类似于include。导入一个外部的模板代码，有利于模板的组织和分离。和直接将外部的模板代码直接替换到该位置一模一样。 不过需要给render传入第三个参数及外部模板对象，以键值对形式，partials对应该对象的键名
实例
```js
var data=[1,2,3];
Whisker.render('{#each $}{<out}{/each}',data,{
    out:'<div>{$}</div>'
});

```

##自定义界定符
通过 Whisker.setDelimeter(start,end)函数，定义界定符，start为左界定符，end为右界定符
如
```js
   Whisker.setDelimeter('#','#');//单字符中，只有#$xxx#不容易被误解析 其他的都容易出现在js表达式中
   Whisker.setDelimete('<%','%>');
   Whisker.setDelimeter('<php','·')
```



##扩展性
以内部each是实现为例进行扩展性的介绍。目前只支持块操作的扩展，像if else 这种分支控制的扩展涉及很多内部的东西，没有想到好的方式扩展，不过分支控制，除了 if else 也没啥其他的了吧。
不过目前的扩展简单性还需要琢磨 （其实这已经是抽取出来的了，掩盖了很多底层细节了）
```js
BlockManager.register('each', function (context, block) {
        //context 解析的上下文对象 用户主要使用他的三个方法 eval resolveResult和throwError 下面会逐一介绍
        //block就是当前这个each的block对象。包含一些block相关的信息。
        //block.blockArgs 这个block的参数即each 后面的参数
        //block.blockScope 这个block的scope block创建时继承于上层block的scope
        //由用户决定是否创建新的blockscope，如果是允许嵌套的结构一定要设置新的blockscope哦
        var result = '';//结果
        //参数处理 主要将$aaa=>$bbb解析出来
        var params = /^\$([a-zA-Z0-9_.]*)(?:\(\$([a-zA-Z0-9_]+)=>\$([a-zA-Z0-9_]+)\))?$/.exec(block.blockArgs);
        
        if (params) {//参数符合规范
            //设置当前block的scope context.eval对
            block.blockScope = context.eval(block.blockScope, params[1]);
            
            if (params[2]) {
                var key = params[2];
                var val = params[3];
            }
            
            var list = block.blockScope;
            //开始循环当前的scope
            if (list) {
                if (list.length > 0) {//判断是数组还是键值对 //这一点有一定缺陷 
                    for (var i = 0; i < list.length; i++) {
                        if (key) {
                            var scope = {};//创建每次迭代的scope
                            scope[key] = i;
                            scope[val] = list[i];
                        }
                        else {
                            scope = list[i];
                        }
                        //链接每次迭代的输出 resolveBlock函数会以scope作为当前scope输出block的结果。
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
        }//参数不合法 跑出错误
        else context.throwError('can\'t resolve arguments of {each}:"' + block.blockArgs + '"');
        return result;//返回最终结果
    });
```
写到这突然发现，这所谓的扩展好复杂啊。还得隐藏底层细节。回去继续重构~ 不过不耽误使用

下一步计划
* 1、重构，优化用户扩展性
* 2、专注性能~ 之前的简单测试中性能在mustache之下在handlebar之上
* 3、预编译，其实我的模式现在编译和计算结构本来就分离的。原理就是把整个模板编译成一个block链组成的结果集。可以考虑下把这个结果集持久化，然后直接求值，提高效率。
* 4、配置化 定制化。 目前想一些格式化功能和一些无关痛痒的功能可以选配。



##自述
最早是想做一个类似SSH (Struts2 Spring Hibernate) Nodejs server框架。为了支持action，所以就想写个模板引擎。
使用{$xxx}其实是模仿EL表达式的，跟mushtache和handlebar没啥关系，反倒觉得他们{{}}好奇怪，好麻烦啊。可能是更好解析，但是{}只要规范控制也会好的解析和分离啊，虽然说{$xx}这种js是不会报错的，但没人会这么写吧，如果你转牛角尖我也没什么办法，╮(╯_╰)╭(由于属性名有严格限制所以{$abc:1} {$abc=1}这一类的都不会被错误的识别成属性)。其实最容易出问题的反而是正则表达式/[{$abc}]/。不过只要稍微改变下写法就能避免。
当然了，我还是参考了mustache和handlebar的优点的，但是懒得研究他们的代码，不过还是取了whisker(络腮胡)这个名字，和他们保持队形 ^_^。
目前我已经在我的各种项目中应用whisker。如果你有什么好的建议或者意见，或者发现了一些BUG，请开一个issue或者mail我

exolution#163.com
谢谢！





额 下面蹩脚的英文可以无视之~



#Whisker.js--Logic-less and extensible javascript template engine

##Why Whisker.js?

>Simple &Concise

Template code like this

```
{$property}
{#block}{/block}
{@method}
{%exp}
```

Have you had enough of {{}} ?

>Logic-less but not non-logic

Logic-less help decoupling the Logic and View , making code clearly.
But excessive logic-less can't be satisfied the demand.
so Whisker.js provides a certain logicality such as expression of "if"

>extansible

this code write in a extansible way.Several layers for extend are supported;

##Getting started
Below is quick example how to use whisker.js:

```
var abc
```
