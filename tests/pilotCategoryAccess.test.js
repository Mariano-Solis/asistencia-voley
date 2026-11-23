import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryPermission } from '../src/pilot/categoryAccess.js'

test('professor sees only delegated editing and attendance controls, even in legacy UI',()=>{
  const scopes=[{category_id:'a',can_view:true,can_edit:false,can_attendance:false},
    {category_id:'b',can_view:true,can_edit:true,can_attendance:false},
    {category_id:'c',can_view:true,can_edit:false,can_attendance:true}]
  assert.equal(categoryPermission('professor',scopes,'edit','a'),false)
  assert.equal(categoryPermission('professor',scopes,'attendance','a'),false)
  assert.equal(categoryPermission('professor',scopes,'edit','b'),true)
  assert.equal(categoryPermission('professor',scopes,'attendance','b'),false)
  assert.equal(categoryPermission('professor',scopes,'attendance','c'),true)
  assert.equal(categoryPermission('professor',scopes,'edit'),true)
  assert.equal(categoryPermission('professor',scopes,'attendance','foreign'),false)
  assert.equal(categoryPermission('professor',[], 'attendance','c'),false)
  assert.equal(categoryPermission('member',scopes,'edit','b'),false)
  assert.equal(categoryPermission('super_admin',[],'attendance','c'),true)
})
