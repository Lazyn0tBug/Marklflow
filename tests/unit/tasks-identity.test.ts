// @vitest-environment node
import {it,expect} from 'vitest';
import {IdentityGate} from '../../src/application/tasks/identity';
it('keeps document admission bounded without closing existing sessions',()=>{const gate=new IdentityGate();for(let i=0;i<32;i++)gate.open(String(i));gate.open('0');expect(gate.sessionCount).toBe(32);expect(()=>gate.open('overflow')).toThrow('capacity');expect(gate.hasSession('0')).toBe(true);expect(()=>gate.activate('missing')).toThrow()});
it('uses only current task ids and clears them when the source document closes',()=>{const gate=new IdentityGate();gate.open('A');gate.open('B');gate.activate('A');gate.expect('A','preview.flow','old');gate.expect('A','preview.flow','new');expect(gate.current('A','preview.flow','old')).toBe(false);expect(gate.current('A','preview.flow','new')).toBe(true);gate.activate('B');expect(gate.current('A','preview.flow','new')).toBe(true);gate.close('A');gate.open('A');expect(gate.current('A','preview.flow','new')).toBe(false)});
