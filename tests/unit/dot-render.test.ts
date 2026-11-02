import {expect,it} from 'vitest';
import {parseDotToGraph,renderDotToSVG} from '../../src/core/render/graphvizRender';

it('keeps DOT default attribute statements out of the node list',()=>{
 const graph=parseDotToGraph('digraph G {\n node [shape=box, fillcolor="#f0fdf4", color="#16a34a"];\n edge [color="#0d9488"];\n A -> B;\n}');
 expect([...graph.nodes.keys()]).toEqual(['A','B']);
 expect(graph.edges).toEqual([{from:'A',to:'B',color:'#0d9488'}]);
});
it('reads a node stroke from color, not from fillcolor',()=>{
 const graph=parseDotToGraph('digraph G {\n A [label="A", fillcolor="#e0f2fe", color="#0284c7"];\n}');
 expect(graph.nodes.get('A')).toMatchObject({fillcolor:'#e0f2fe',color:'#0284c7'});
 const svg=renderDotToSVG('digraph G {\n A [label="A", fillcolor="#e0f2fe", color="#0284c7"];\n}');
 expect(svg).toContain('stroke="#0284c7"');
 expect(svg).not.toContain('stroke="#e0f2fe"');
});
it('applies DOT node defaults to nodes without their own attributes',()=>{
 const graph=parseDotToGraph('digraph G {\n node [fillcolor="#f0fdf4", color="#16a34a"];\n A [label="A"];\n B [label="B", color="#0284c7"];\n}');
 expect(graph.nodes.get('A')).toMatchObject({fillcolor:'#f0fdf4',color:'#16a34a'});
 expect(graph.nodes.get('B')).toMatchObject({fillcolor:'#f0fdf4',color:'#0284c7'});
});
