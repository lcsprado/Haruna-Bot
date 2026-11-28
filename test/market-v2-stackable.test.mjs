import test from 'node:test';
import assert from 'node:assert/strict';
import {assertV2MarketListing,v2MarketQuantityLimit,V2_MARKET_MAX_PRICE} from '../src/neon/reboot-assets-policy.js';
const opts=item=>({enabled:true,item});
test('raid materials and consumables can be advertised in large stacks',()=>{
 for(const category of ['special','material','consumable']){
  const item={category,stackable:true};
  assert.doesNotThrow(()=>assertV2MarketListing(1214,80000,opts(item)));
  assert.doesNotThrow(()=>assertV2MarketListing(10000,V2_MARKET_MAX_PRICE,opts(item)));
 }
});
test('gear and non-stackable items keep the 25-unit limit',()=>{
 for(const category of ['weapon','armor','boots','helmet','shield','relic']){
  const item={category,stackable:true};
  assert.equal(v2MarketQuantityLimit(item,{enabled:true}),25);
  assert.doesNotThrow(()=>assertV2MarketListing(25,5000000,opts(item)));
  assert.throws(()=>assertV2MarketListing(26,80000,opts(item)));
 }
 assert.throws(()=>assertV2MarketListing(26,80000,opts({category:'special',stackable:false})));
});
test('invalid quantity and prices above the market cap are rejected',()=>{
 const item={category:'special',stackable:true};
 for(const qty of [0,-1,1.5,2147483648,Infinity])assert.throws(()=>assertV2MarketListing(qty,80000,opts(item)));
 for(const price of [0,-1,1.5,5000001,Infinity])assert.throws(()=>assertV2MarketListing(1214,price,opts(item)));
});
