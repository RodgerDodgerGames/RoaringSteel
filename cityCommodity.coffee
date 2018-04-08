# cityCommodity.js
L.CityCommodity = L.Class.extend(
    initialize: (options) ->
        # census tables to assist with employment queries
        @_industries = []
        @_geographies = []
        @_data = []
        # var industryListingURL = "https://lehd.ces.census.gov/data/schema/latest/label_industry.csv",
        #     geographyListingURL = "https://lehd.ces.census.gov/data/schema/latest/label_geography.csv";
        # load locally since the census resources were giving me trouble
        @_industryListingURL = 'label_industry.csv'
        @_geographyListingURL = 'label_geography.csv'
        @_baseurl = 'https://api.census.gov/data/timeseries/qwi/sa?'
        @_key = '36628d51ad86d97e94ecd9677ce9e0bd46a3e8f3'
        @_townsURL = 'https://maps.bts.dot.gov/services/rest/services/NTAD/Populated_Places/MapServer/0'
        # TODO: 2017 wasn't working for some reason so just use 2016 for now
        # this._year = new Date().getFullYear();
        @_year = '2016'
        # setup queue for multiple requests
        d3.queue(2)
            .defer(d3.csv, @_industryListingURL)
            .defer(d3.csv, @_geographyListingURL)
            .awaitAll @_censusTableUploadHandler.bind(this)
        return
    _restOfInit: ->

        ###
        Essentially, we are trying to create a list of towns that intersect
        between the esri towns layer and the census industry layer.
        To begin with, attempt a straight intersect.
        But since there are more towns in the esri data than in the industry
        layer attempt to match towns based on prominence (size, county seat?)
        within the county
        ###

        # compare with the census geographies
        @data = @_townCensusIntersect.call(this)

        ###
        Next, we need to find the top industries for our culled list of towns.
        We call this here since it may take a while to run and return all
        these requests.
        Top industries are determined based on employment counts and earnings.
        Record the top three for each town since we may need to go to backups; we want to avoid a situation where there is a clump of towns that all supply the same thing.
        called with this._assignIndustry
        ###

        ###
        Concurrently, we can categorize the towns.
        This is based on their population.
        Categorize them into small, medium, and large.
        Use d3.quantiles as such small < 0.75 > medium < 0.9 > large
        called with this._categorizeTowns
        ###

        ###
        Then, show the town layer.
        Symbolize based on category size.
        called with this._showTowns
        ###

        return
    _getPlace: (town, state, qwitown, callback) ->
        townFields = [
            'COUNTY'
            'COUNTYFIPS'
            'NAME'
            'OBJECTID'
            'POP_2010'
            'STATE'
            'STATE_FIPS'
        ]

        _setWhereClause = (t, s) ->
            'NAME = \'%town%\' and STATE_FIPS = \'%state%\''.replace('%town%', t).replace '%state%', s

        L.esri.query(
            url: @_townsURL
            useCors: false).fields(townFields).where(_setWhereClause(town, state)).returnGeometry(false).run ((error, townFeatures) ->
            if error
                throw error
            callback qwitown, townFeatures
            return
        ), this
        return
    _getPlaceHandler: (qwitown, results) ->
        # check and make sure there's just one result
        if results.features.length != 1
            console.log 'no match with', qwitown.label
            return false
        # if it matches grab the attributes
        console.log 'found match in', qwitown.label
        k = results['features'][0]['properties']
        # add qwi geography
        k['qwiGeography'] = qwitown['geography'].slice(2)
        # then get industry info
        # first, total industry
        # TODO: set this all up as a d3.queue
        # with each request as a defer
        # 1. get place
        # 2. get total industry
        # 3. get top three industries
        tot = @_getTotalIndustry(k, @_getTotalIndustryHandler)
        console.log tot
        return

    _getTotalIndustry: (town) ->
        console.log 'total industry for', town.NAME
        @_getIndustry town, [ '00' ], @_getTotalIndustryHandler

    _getTotalIndustryHandler: (results) ->
        # return sum of employment for all quarters
        d3.sum results, (d) ->
            d['EmpS']

    _townCensusIntersect: ->
        # loop through census geogs
        g = 0
        while g < @_geographies.length
            console.log('Working on', this._geographies[g].label, '...');
            # state fips is first two digits of geography
            state = @_geographies[g].geography.slice(0, 2)
            # split up towns to handle multiple
            qwiTowns = @_geographies[g].label.split(',')[0].split('-')
            # then loop through towns and attempt a match
            t = 0
            while t < qwiTowns.length
                # send request to pop places
                @_getPlace qwiTowns[t], state, @_geographies[g], @_getPlaceHandler.bind(this)
                t++
            g++
        # return keepers;
        # // assign industries to towns
        # this._assignIndustry(this._key, this._baseurl, this._industryParamList);
        # // put towns into categories
        # this._categorizeTowns();
        return
    _categorizeTowns: ->
        # reduce towns to array of ID and population
        popArray = []
        @eachLayer (layer) ->
            popArray.push [ layer.feature.properties.POP_2010 ]
            return
        # assign category to towns
        # run through d3.quantiles
        # small < 0.75 > medium < 0.9 > large
        @eachLayer (layer) ->
            pop = layer.feature.properties.POP_2010
            # small
            if pop < d3.quantile(popArray, 0.75)
                layer._category = 'small'
            else if pop >= d3.quantile(popArray, 0.75) and pop < d3.quantile(popArray, 0.9)
                layer._category = 'medium'
            else
                layer._category = 'large'
            return
        # now display towns again with icon based on category
        @_showTowns popArray
        return

    _getIndustry = (town, industries, callback) ->

        # format census results (array of arrays) into object
        _censusResultsToObject = (results, callback) ->
            # grab headers
            data = []
            keys = results.shift()
            # loop through data and add to object
            i = 0
            while i < results.length
                # convert array to object map with reduce
                row = results[i].reduce(((obj, item, idx) ->
                    obj[keys[idx]] = item
                    obj
                ), {})
                data.push row
                i++
            # when finished send off to the callback
            callback data
            return

        # manually encode params
        # since the census site was rejected the way these were being encoded
        # the url example above returns a correct result

        _manuallyEncodeParams = (urlParams) ->
            paramList = []
            template = '%key%=%val%'
            for param of urlParams
                if urlParams.hasOwnProperty(param)
                    paramList.push template.replace('%key%', param).replace('%val%', urlParams[param])
            paramList.join '&'

        # set "for" value for request
        _setFor = (layer) ->
            'metropolitan%20statistical%20area/micropolitan%20statistical%20area:' + town.qwiGeography

        # set "in" value for request
        _setIn = (layer) ->
            'state:' + town.STATE_FIPS

        _setIndustryString = (industryList) ->
            indParamList = []
            template = 'industry=%indCode%'
            # loop through industries and add to param string
            i = 0
            while i < industryList.length
                indParamList.push template.replace('%indCode%', industryList[i])
                i++
            indParamList.join '&'

        urlParams =
            key: @_key
            get: 'EmpS'
            for: _setFor(town)
            in: _setIn(town)
            time: @_year
        url = @_baseurl + _manuallyEncodeParams(urlParams) + '&' + _setIndustryString(industries)
        # url = base + L.Util.getParamString(urlParams) + indParams;
        # https://api.census.gov/data/timeseries/qwi/sa?key=36628d51ad86d97e94ecd9677ce9e0bd46a3e8f3&get=EmpS&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area:10660&in=state:27&time=2016&industry=00

        console.log url
        d3.json(url).get (error, results) ->
            if error
                throw error
            _censusResultsToObject results, callback
            return
        return

    # TODO: what does showTowns do?
    _showTowns: (popArray) ->
        @eachLayer (layer) ->
            townTooltipOptions =
                direction: 'center'
                offset: L.point(18, 18)
                permanent: true
                className: 'town-tooltip'
            # TODO: create and assign icons based on category
            # small, medium, large
            iconSize = {
                'small': 18
                'medium': 26
                'large': 36
            }[layer._category]
            townIcon = L.icon(
                iconUrl: 'town.png'
                iconSize: [
                    iconSize
                    iconSize
                ]
                iconAnchor: [
                    iconSize / 2
                    iconSize / 2
                ])
            layer.setIcon(townIcon).bindTooltip(((layer) ->
                layer.feature.properties['NAME']
            ), townTooltipOptions).openTooltip().setOpacity 1
            return
        return
    _getTownsLayerLists: ->
        @townNames = []
        @_townCounties = []
        @_townStates = []
        # first get list of ansicodes, counties, and states
        townsLayer.eachLayer ((layer) ->
            @townNames.push layer.feature.properties.NAME
            @_townCounties.push layer.feature.properties.COUNTYFIPS
            @_townStates.push layer.feature.properties.STATE_FIPS
            return
        ), this
        return
    _censusTableUploadHandler: (error, results) ->

        _filterGeographies = (data) ->
            data.filter (geog) ->
                # return if metro micro and skip the "non" listings
                geog.geo_level == 'M' and geog.geography.slice(2) != '99999'

        if error
            throw error
        console.log results
        # first result is industry
        @_industries = results[0]
        # this._geographies = results[1];
        # filter geographies down to micro/metro stat areas
        @_geographies = _filterGeographies(results[1])
        # once we have the tables
        # wait for the layer to load and then run the rest of the init
        @_restOfInit()
        return
)
# factory

L.cityCommodity = (options) ->
    new (L.CityCommodity)(options)

# ---
# generated by js2coffee 2.2.0