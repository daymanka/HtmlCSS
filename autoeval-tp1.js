'use strict';

const globalagent = require('global-agent');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const process = require('process');
const cssvalidate = require('w3c-css-validator');
const htmlvalidate = require('node-w3c-validator')
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

// set HTTP_PROXY environment variables if not set (and http_proxy is..)
if( process.env.HTTP_PROXY == undefined)
    process.env.HTTP_PROXY = process.env.http_proxy
if( process.env.HTTPS_PROXY == undefined)
    process.env.HTTPS_PROXY = process.env.https_proxy

// configure global proxy for css-validator
globalagent.bootstrap({environmentVariableNamespace : ""});

// promise based version of html validator
const htmlvalidatePromise = (validationPath, userOptions) => {
    return new Promise ((resolve, reject) => {
        htmlvalidate( validationPath, userOptions, (err, output)=>{
            resolve(output)
        })
    })
  }
 
console.log('Processing...');
analyseWork()
.then( results => {
    fs.writeFile('eval.json', JSON.stringify(results) )
    ;
});

// Analyse students work
async function analyseWork( ){
    // Create result object
    let res={ htmlValidation: {}, cssValidation: {}};
    // Init final score
    res.autoCheckScore = 0;

    // Validate HTML
    let result;
    result = await htmlvalidatePromise( 'index.html', { 
        format: 'json'
    });
    if( result == '' ){
        res.htmlValidation.valid = true;
        res.autoCheckScore += 10;
    }
    else{
        result = JSON.parse(result);
        // reformat validation output
        res.htmlValidation.errors = result.messages.filter( e => e.type == 'error');
        res.htmlValidation.warnings = result.messages.filter( e => e.type == 'info');
        res.htmlValidation.valid = res.htmlValidation.errors.length == 0;
        // Update score
        res.autoCheckScore += 10/(2**res.htmlValidation.errors.length);
    }

    // Load CSS and validate it
    let css = '';
    let cssData = await fs.readFile('style.css', 'utf8')
    result = await cssvalidate.validateText(cssData,{
        warningLevel : 2
    });

    res.cssValidation = result;
    // Update score
    res.autoCheckScore += 10/(2**res.cssValidation.errors.length);

    // Load HTML
    let html = '';
    let htmlData = await fs.readFile('index.html', 'utf8')

    // Build DOM
    // but first, inject style.css in html data (because jsdom does
    // not seem to handle well accents in urls)
    let endOfHead = htmlData.indexOf('</head>');
    htmlData = htmlData.substring(0, endOfHead) + '\n<style>\n' + cssData + '\n</style>\n' + htmlData.substring(endOfHead);
    
    try{
        let dom = new JSDOM(htmlData);
        let doc = dom.window.document;

        // Check additional conditions for HTML
        res.htmlCheck = checkHTML(doc);

        // Check additional conditions for CSS
        res.cssCheck = checkCSS(doc);
    }
    catch(e){
        res.checkError = true;
        res.checkErrorDetails = e;
        res.htmlCheck = {};
        res.cssCheck = {}
    }
    // Update score
    let props = Object.entries( res.htmlCheck );
    props.concat(Object.entries( res.cssCheck ));
    props.forEach( ([k, v]) => {
        if( v.eval === true )
            res.autoCheckScore += 1;
    });
    res.autoCheckScore = parseInt(100*res.autoCheckScore/(20+props.length));

    console.log("Votre score d'autoévaluation (max=100): " + res.autoCheckScore);
    console.log("La validation HTML / CSS par les outils du W3C compte pour 50% de ce score");
    console.log("Veuillez consulter les détails de l'évaluation dans le fichier 'eval.json'");
    //console.log(res);

    return res;
}

function checkHTML( doc ){
    let res = {};

    // All necessary elements are present
    res.nav = { 
        eval : doc.querySelectorAll('nav').length > 0,
        comment : "Il devrait y avoir a minima un élément nav puisqu'il y a un menu de navigation dans la page"
    }
    res.header = {
        eval : doc.querySelectorAll('header').length == 1,
        comment : "Il doit y avoir un élément header dans la page puisque les images illustrant la page montrent qu'elle possède un entête"
    }
    res.footer = {
        eval : doc.querySelectorAll('footer').length == 1,
        comment : "Il doit y avoir un élément footer dans la page puisque les images illustrant la page montrent qu'elle possède un pied de page"
    }
    res.aside = {
        eval : doc.querySelectorAll('aside').length == 1,
        comment : "La partie droite de la page présentant les dernières sorties peut être considérée comme non  essentielle et donc être placée dans un élément aside"
    }
    res.form = {
        eval : doc.querySelectorAll('form').length == 1,
        comment : "La norme HTML5 n'oblige pas à avoir un formulaire autour des éléments input ou button, mais il est recommandé d'en avoir un pour une meilleure lisibilité"
    }
    res.q = {
        eval : doc.querySelectorAll('q').length > 0,
        comment : "Il y a des citation dans la partie des dernières sorties. Il faut donc des éléments q pour citer le texte"
    }
    res.cite = {
        eval : doc.querySelectorAll('cite').length > 0,
        comment : "Il y a des citation dans la partie des dernières sorties. Il faut donc des éléments cite pour citer les auteurs de ces citations"
    }
    res.theadTbody = {
        eval : doc.querySelectorAll('thead').length == 1 && doc.querySelectorAll('tbody').length == 1,
        comment : "Le tableau présent dans cette page a un entête il faut donc utiliser les éléments HTML permettant de déclarer cet entête (thead) et le corps du tableau (tbody)"
    }
    res.sectionsAndArticles = {
        eval : [3,6].includes(doc.querySelectorAll('section article').length)  || [3,6].includes(doc.querySelectorAll('article section').length),
        comment : "Il faut des sections et des articles pour structurer le contenu de la page. On vérifie également qu'il y en a 3 et 6 de chaque type"
    }
    res.onlyOneh1 = {
        eval : doc.querySelectorAll('h1').length == 1,
        comment : "Il n'y a besoin que d'un seul titre de niveau 1 dans une page. C'est le titre principal de la page"
    }
    res.h2h3 = {
        eval : doc.querySelectorAll('h2, h3').length > 0,
        comment : "La structure de la page nécessite des titres de niveau 2 et 3 seulement"
    }
    res.noh4h5h6 = {
        eval : doc.querySelectorAll('h4, h5, h6').length == 0,
        comment : "La structure de la page ne nécessite pas de titres de niveau 4, 5 ou 6"
    }
    res.thInThead = {
        eval : doc.querySelectorAll('thead th').length > 0,
        comment : "Dans les entêtes de tableau, il doit y avoir des éléments th (et pas des td)"
    }

    // No stupid things
    res.noDiv = {
        eval : doc.querySelectorAll('div').length == 0,
        comment : "Pas besoin d'utiliser des div dans cette page. Les éléments section et article sont suffisants pour structurer le contenu"
    }
    res.noBr = {
        eval : doc.querySelectorAll('br').length == 0,
        comment : "Pas besoin d'élements br dans cette page. Il est largement préférable d'utiliser des paragraphes ou des listes pour structurer le contenu"
    }

    // imgs have alt
    let imgs = doc.querySelectorAll('img');
    res.imgsAlt = {
        eval : true,
        comment : "Toutes les images doivent avoir un attribut alt pour être accessibles aux personnes malvoyantes ou non-voyantes"
    }
    imgs.forEach( img => {
        if( img.alt === '' )
            res.imgsAlt.eval = false;
    })

    // hrefs have #
    let as = doc.querySelectorAll('a');
    res.noEmptyHref = {
        eval : true,
        comment : "Lorsqu'un lien est vide il est recommandé de mettre un href='#' pour éviter qu'un clic sur le lien recharge la page"
    }
    as.forEach( a => {
        if( a.href === '' || (a.href.length == 1 && a.hrefs == '#') )
            res.noEmptyHref = false;
    })

    // form label and for
    let label = doc.querySelector('form label');
    res.formLabelAndFor = {
        eval : label != null && label.htmlFor != undefined,
        comment : "Il doit y avoir un label pour le champ de recherche du formulaire et celui-ci doit être associé à son input via l'attribut for"
    }

    // titles of "sections" and articles are in the right order
    let refTitles = ['PolyMusic','Pop/Rock', 'Pop/Rock Artists Highlights', 'Pop/Rock Song Highlights', 'Recent Pop/Rock Releases'];
    let content = doc.documentElement.textContent;
    res.titlesOrderPreserved = {
        eval : true,
        comment : "Les titres des sections doivent être dans l'ordre du texte initial. La mise en page ne doit pas avoir d'influence sur l'ordre des informations (en grande partie pour des raisons d'accessibilité)"
    }
    let lastIndex = 0;
    refTitles.forEach( title => {
        let pos = content.indexOf(title, lastIndex);
        if( pos == -1 ){
            res.titlesOrderPreserved.eval = false;
        }
        else
            lastIndex = pos;
    });
    
    return res;
}

function checkCSS( doc ){
    let res = {};

    // Warning: current checks do not work with media queries, only standard CSS rules...

    // no float and position together
    let style = doc.styleSheets[0];
    res.noFloatAndPosition = {
        eval : true,
        comment : "Il faut utiliser soit la propriété float, soit la propriétés position (par exemple absolute), mais pas les deux en même temps"
    }
    style.cssRules.forEach( rule => {
        if( rule.style && rule.style.position != undefined && rule.style.float != undefined )
            res.noFloatAndPosition.eval = false;
    });

    return res;
}